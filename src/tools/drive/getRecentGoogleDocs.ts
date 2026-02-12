import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getRecentGoogleDocs',
    description: 'Gets the most recently modified Google Documents.',
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of recent documents to return.'),
      daysBack: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe('Only show documents modified within this many days.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Getting recent Google Docs: ${args.maxResults} results, ${args.daysBack} days back`);

      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - args.daysBack);
        const cutoffDateStr = cutoffDate.toISOString();

        const queryString = `mimeType='application/vnd.google-apps.document' and trashed=false and modifiedTime > '${cutoffDateStr}'`;

        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: 'modifiedTime desc',
          fields:
            'files(id,name,modifiedTime,createdTime,webViewLink,owners(displayName),lastModifyingUser(displayName))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];

        if (files.length === 0) {
          return `No Google Docs found that were modified in the last ${args.daysBack} days.`;
        }

        let result = `${files.length} recently modified Google Document(s) (last ${args.daysBack} days):\n\n`;
        files.forEach((file, index) => {
          const modifiedDate = file.modifiedTime
            ? new Date(file.modifiedTime).toLocaleString()
            : 'Unknown';
          const lastModifier = file.lastModifyingUser?.displayName || 'Unknown';
          const owner = file.owners?.[0]?.displayName || 'Unknown';

          result += `${index + 1}. **${file.name}**\n`;
          result += `   ID: ${file.id}\n`;
          result += `   Last Modified: ${modifiedDate} by ${lastModifier}\n`;
          result += `   Owner: ${owner}\n`;
          result += `   Link: ${file.webViewLink}\n\n`;
        });

        return result;
      } catch (error: any) {
        log.error(`Error getting recent Google Docs: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        throw new UserError(`Failed to get recent documents: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
