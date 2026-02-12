import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'deleteFile',
    description: 'Permanently deletes a file or folder from Google Drive.',
    parameters: z.object({
      fileId: z.string().describe('ID of the file or folder to delete.'),
      skipTrash: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, permanently deletes the file. If false, moves to trash (can be restored).'
        ),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Deleting file ${args.fileId} ${args.skipTrash ? '(permanent)' : '(to trash)'}`);

      try {
        // Get file info before deletion
        const fileInfo = await drive.files.get({
          fileId: args.fileId,
          fields: 'name,mimeType',
          supportsAllDrives: true,
        });

        const fileName = fileInfo.data.name;
        const isFolder = fileInfo.data.mimeType === 'application/vnd.google-apps.folder';

        if (args.skipTrash) {
          await drive.files.delete({
            fileId: args.fileId,
            supportsAllDrives: true,
          });
          return `Permanently deleted ${isFolder ? 'folder' : 'file'} "${fileName}".`;
        } else {
          await drive.files.update({
            fileId: args.fileId,
            requestBody: {
              trashed: true,
            },
            supportsAllDrives: true,
          });
          return `Moved ${isFolder ? 'folder' : 'file'} "${fileName}" to trash. It can be restored from the trash.`;
        }
      } catch (error: any) {
        log.error(`Error deleting file: ${error.message || error}`);
        if (error.code === 404) throw new UserError('File not found. Check the file ID.');
        if (error.code === 403)
          throw new UserError('Permission denied. Make sure you have delete access to this file.');
        throw new UserError(`Failed to delete file: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
