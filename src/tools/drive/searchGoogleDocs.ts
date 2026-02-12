import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'searchGoogleDocs',
    description: 'Searches for Google Documents by name, content, or other criteria.',
    parameters: z.object({
      searchQuery: z.string().min(1).describe('Search term to find in document names or content.'),
      searchIn: z
        .enum(['name', 'content', 'both'])
        .optional()
        .default('both')
        .describe('Where to search: document names, content, or both.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of results to return.'),
      modifiedAfter: z
        .string()
        .optional()
        .describe(
          'Only return documents modified after this date (ISO 8601 format, e.g., "2024-01-01").'
        ),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(`Searching Google Docs for: "${args.searchQuery}" in ${args.searchIn}`);

      try {
        let queryString = "mimeType='application/vnd.google-apps.document' and trashed=false";

        // Add search criteria
        if (args.searchIn === 'name') {
          queryString += ` and name contains '${args.searchQuery}'`;
        } else if (args.searchIn === 'content') {
          queryString += ` and fullText contains '${args.searchQuery}'`;
        } else {
          queryString += ` and (name contains '${args.searchQuery}' or fullText contains '${args.searchQuery}')`;
        }

        // Add date filter if provided
        if (args.modifiedAfter) {
          queryString += ` and modifiedTime > '${args.modifiedAfter}'`;
        }

        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,modifiedTime,createdTime,webViewLink,owners(displayName),parents)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];

        if (files.length === 0) {
          return `No Google Docs found containing "${args.searchQuery}".`;
        }

        let result = `Found ${files.length} document(s) matching "${args.searchQuery}":\n\n`;
        files.forEach((file, index) => {
          const modifiedDate = file.modifiedTime
            ? new Date(file.modifiedTime).toLocaleDateString()
            : 'Unknown';
          const owner = file.owners?.[0]?.displayName || 'Unknown';
          result += `${index + 1}. **${file.name}**\n`;
          result += `   ID: ${file.id}\n`;
          result += `   Modified: ${modifiedDate}\n`;
          result += `   Owner: ${owner}\n`;
          result += `   Link: ${file.webViewLink}\n\n`;
        });

        return result;
      } catch (error: any) {
        log.error(`Error searching Google Docs: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        throw new UserError(`Failed to search documents: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
