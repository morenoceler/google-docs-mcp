import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listFolderContents',
    description: 'Lists the contents of a specific folder in Google Drive.',
    parameters: z.object({
      folderId: z
        .string()
        .describe('ID of the folder to list contents of. Use "root" for the root Drive folder.'),
      includeSubfolders: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include subfolders in results.'),
      includeFiles: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include files in results.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Maximum number of items to return.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Listing contents of folder: ${args.folderId}`);

      try {
        let queryString = `'${args.folderId}' in parents and trashed=false`;

        // Filter by type if specified
        if (!args.includeSubfolders && !args.includeFiles) {
          throw new UserError('At least one of includeSubfolders or includeFiles must be true.');
        }

        if (!args.includeSubfolders) {
          queryString += ` and mimeType!='application/vnd.google-apps.folder'`;
        } else if (!args.includeFiles) {
          queryString += ` and mimeType='application/vnd.google-apps.folder'`;
        }

        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: 'folder,name',
          fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,owners(displayName))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const items = response.data.files || [];

        if (items.length === 0) {
          return "The folder is empty or you don't have permission to view its contents.";
        }

        let result = `Contents of folder (${items.length} item${items.length !== 1 ? 's' : ''}):\n\n`;

        // Separate folders and files
        const folders = items.filter(
          (item) => item.mimeType === 'application/vnd.google-apps.folder'
        );
        const files = items.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');

        // List folders first
        if (folders.length > 0 && args.includeSubfolders) {
          result += `**Folders (${folders.length}):**\n`;
          folders.forEach((folder) => {
            result += `📁 ${folder.name} (ID: ${folder.id})\n`;
          });
          result += '\n';
        }

        // Then list files
        if (files.length > 0 && args.includeFiles) {
          result += `**Files (${files.length}):\n`;
          files.forEach((file) => {
            const fileType =
              file.mimeType === 'application/vnd.google-apps.document'
                ? '📄'
                : file.mimeType === 'application/vnd.google-apps.spreadsheet'
                  ? '📊'
                  : file.mimeType === 'application/vnd.google-apps.presentation'
                    ? '📈'
                    : '📎';
            const modifiedDate = file.modifiedTime
              ? new Date(file.modifiedTime).toLocaleDateString()
              : 'Unknown';
            const owner = file.owners?.[0]?.displayName || 'Unknown';

            result += `${fileType} ${file.name}\n`;
            result += `   ID: ${file.id}\n`;
            result += `   Modified: ${modifiedDate} by ${owner}\n`;
            result += `   Link: ${file.webViewLink}\n\n`;
          });
        }

        return result;
      } catch (error: any) {
        log.error(`Error listing folder contents: ${error.message || error}`);
        if (error.code === 404) throw new UserError('Folder not found. Check the folder ID.');
        if (error.code === 403)
          throw new UserError('Permission denied. Make sure you have access to this folder.');
        throw new UserError(`Failed to list folder contents: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
