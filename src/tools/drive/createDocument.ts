import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { drive_v3 } from 'googleapis';
import { getDriveClient, getDocsClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'createDocument',
    description: 'Creates a new Google Document.',
    parameters: z.object({
      title: z.string().min(1).describe('Title for the new document.'),
      parentFolderId: z
        .string()
        .optional()
        .describe(
          'ID of folder where document should be created. If not provided, creates in Drive root.'
        ),
      initialContent: z.string().optional().describe('Initial text content to add to the document.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Creating new document "${args.title}"`);

      try {
        const documentMetadata: drive_v3.Schema$File = {
          name: args.title,
          mimeType: 'application/vnd.google-apps.document',
        };

        if (args.parentFolderId) {
          documentMetadata.parents = [args.parentFolderId];
        }

        const response = await drive.files.create({
          requestBody: documentMetadata,
          fields: 'id,name,webViewLink',
          supportsAllDrives: true,
        });

        const document = response.data;
        let result = `Successfully created document "${document.name}" (ID: ${document.id})\nView Link: ${document.webViewLink}`;

        // Add initial content if provided
        if (args.initialContent) {
          try {
            const docs = await getDocsClient();
            await docs.documents.batchUpdate({
              documentId: document.id!,
              requestBody: {
                requests: [
                  {
                    insertText: {
                      location: { index: 1 },
                      text: args.initialContent,
                    },
                  },
                ],
              },
            });
            result += `\n\nInitial content added to document.`;
          } catch (contentError: any) {
            log.warn(`Document created but failed to add initial content: ${contentError.message}`);
            result += `\n\nDocument created but failed to add initial content. You can add content manually.`;
          }
        }

        return result;
      } catch (error: any) {
        log.error(`Error creating document: ${error.message || error}`);
        if (error.code === 404) throw new UserError('Parent folder not found. Check the folder ID.');
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have write access to the destination folder.'
          );
        throw new UserError(`Failed to create document: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
