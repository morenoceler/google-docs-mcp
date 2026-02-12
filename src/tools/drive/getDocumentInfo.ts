import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { getDriveClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getDocumentInfo',
    description: 'Gets detailed information about a specific Google Document.',
    parameters: DocumentIdParameter,
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Getting info for document: ${args.documentId}`);

      try {
        const response = await drive.files.get({
          fileId: args.documentId,
          // Note: 'permissions' and 'alternateLink' fields removed - they cause
          // "Invalid field selection" errors for Google Docs files
          fields:
            'id,name,description,mimeType,size,createdTime,modifiedTime,webViewLink,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress),shared,parents,version',
          supportsAllDrives: true,
        });

        const file = response.data;

        if (!file) {
          throw new UserError(`Document with ID ${args.documentId} not found.`);
        }

        const createdDate = file.createdTime
          ? new Date(file.createdTime).toLocaleString()
          : 'Unknown';
        const modifiedDate = file.modifiedTime
          ? new Date(file.modifiedTime).toLocaleString()
          : 'Unknown';
        const owner = file.owners?.[0];
        const lastModifier = file.lastModifyingUser;

        let result = `**Document Information:**\n\n`;
        result += `**Name:** ${file.name}\n`;
        result += `**ID:** ${file.id}\n`;
        result += `**Type:** Google Document\n`;
        result += `**Created:** ${createdDate}\n`;
        result += `**Last Modified:** ${modifiedDate}\n`;

        if (owner) {
          result += `**Owner:** ${owner.displayName} (${owner.emailAddress})\n`;
        }

        if (lastModifier) {
          result += `**Last Modified By:** ${lastModifier.displayName} (${lastModifier.emailAddress})\n`;
        }

        result += `**Shared:** ${file.shared ? 'Yes' : 'No'}\n`;
        result += `**View Link:** ${file.webViewLink}\n`;

        if (file.description) {
          result += `**Description:** ${file.description}\n`;
        }

        return result;
      } catch (error: any) {
        log.error(`Error getting document info: ${error.message || error}`);
        if (error.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (error.code === 403)
          throw new UserError('Permission denied. Make sure you have access to this document.');
        throw new UserError(`Failed to get document info: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
