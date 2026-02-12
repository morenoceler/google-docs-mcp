import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getFolderInfo',
    description: 'Gets detailed information about a specific folder in Google Drive.',
    parameters: z.object({
      folderId: z.string().describe('ID of the folder to get information about.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Getting folder info: ${args.folderId}`);

      try {
        const response = await drive.files.get({
          fileId: args.folderId,
          fields:
            'id,name,description,createdTime,modifiedTime,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName),shared,parents',
          supportsAllDrives: true,
        });

        const folder = response.data;

        if (folder.mimeType !== 'application/vnd.google-apps.folder') {
          throw new UserError('The specified ID does not belong to a folder.');
        }

        const createdDate = folder.createdTime
          ? new Date(folder.createdTime).toLocaleString()
          : 'Unknown';
        const modifiedDate = folder.modifiedTime
          ? new Date(folder.modifiedTime).toLocaleString()
          : 'Unknown';
        const owner = folder.owners?.[0];
        const lastModifier = folder.lastModifyingUser;

        let result = `**Folder Information:**\n\n`;
        result += `**Name:** ${folder.name}\n`;
        result += `**ID:** ${folder.id}\n`;
        result += `**Created:** ${createdDate}\n`;
        result += `**Last Modified:** ${modifiedDate}\n`;

        if (owner) {
          result += `**Owner:** ${owner.displayName} (${owner.emailAddress})\n`;
        }

        if (lastModifier) {
          result += `**Last Modified By:** ${lastModifier.displayName}\n`;
        }

        result += `**Shared:** ${folder.shared ? 'Yes' : 'No'}\n`;
        result += `**View Link:** ${folder.webViewLink}\n`;

        if (folder.description) {
          result += `**Description:** ${folder.description}\n`;
        }

        if (folder.parents && folder.parents.length > 0) {
          result += `**Parent Folder ID:** ${folder.parents[0]}\n`;
        }

        return result;
      } catch (error: any) {
        log.error(`Error getting folder info: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Folder not found (ID: ${args.folderId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Make sure you have access to this folder.');
        throw new UserError(`Failed to get folder info: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
