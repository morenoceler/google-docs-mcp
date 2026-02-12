import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient, getDriveClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertImage',
    description:
      'Inserts an inline image into a Google Document. Provide either a publicly accessible URL or a local file path. Local files are automatically uploaded to Google Drive before insertion.',
    parameters: DocumentIdParameter.extend({
      imageUrl: z
        .string()
        .url()
        .optional()
        .describe('Publicly accessible URL to the image (http:// or https://).'),
      localImagePath: z
        .string()
        .optional()
        .describe(
          'Absolute path to a local image file (supports .jpg, .jpeg, .png, .gif, .bmp, .webp, .svg). The file will be uploaded to Google Drive.'
        ),
      index: z
        .number()
        .int()
        .min(1)
        .describe(
          '1-based character index in the document body where the image should be inserted. Use readDocument with format=\'json\' to inspect indices.'
        ),
      width: z.number().min(1).optional().describe('Width of the image in points.'),
      height: z.number().min(1).optional().describe('Height of the image in points.'),
    }).refine((data) => data.imageUrl || data.localImagePath, {
      message: 'Either imageUrl or localImagePath must be provided.',
    }).refine((data) => !(data.imageUrl && data.localImagePath), {
      message: 'Provide only one of imageUrl or localImagePath, not both.',
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();

      try {
        let resolvedUrl: string;

        if (args.localImagePath) {
          const drive = await getDriveClient();
          log.info(
            `Uploading local image ${args.localImagePath} and inserting at index ${args.index} in doc ${args.documentId}`
          );

          // Get the document's parent folder
          let parentFolderId: string | undefined;
          try {
            const docInfo = await drive.files.get({
              fileId: args.documentId,
              fields: 'parents',
              supportsAllDrives: true,
            });
            if (docInfo.data.parents && docInfo.data.parents.length > 0) {
              parentFolderId = docInfo.data.parents[0];
            }
          } catch (folderError) {
            log.warn(
              `Could not determine document's parent folder, using Drive root: ${folderError}`
            );
          }

          resolvedUrl = await GDocsHelpers.uploadImageToDrive(
            drive,
            args.localImagePath,
            parentFolderId
          );
          log.info(`Image uploaded successfully, URL: ${resolvedUrl}`);
        } else {
          resolvedUrl = args.imageUrl!;
          log.info(
            `Inserting image from URL ${resolvedUrl} at index ${args.index} in doc ${args.documentId}`
          );
        }

        await GDocsHelpers.insertInlineImage(
          docs,
          args.documentId,
          resolvedUrl,
          args.index,
          args.width,
          args.height
        );

        let sizeInfo = '';
        if (args.width && args.height) {
          sizeInfo = ` with size ${args.width}x${args.height}pt`;
        }

        return `Successfully inserted image at index ${args.index}${sizeInfo}.`;
      } catch (error: any) {
        log.error(
          `Error inserting image in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert image: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
