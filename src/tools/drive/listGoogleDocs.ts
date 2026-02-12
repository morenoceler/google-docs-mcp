import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listGoogleDocs',
    description: 'Lists Google Documents from your Google Drive with optional filtering.',
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of documents to return (1-100).'),
      query: z.string().optional().describe('Search query to filter documents by name or content.'),
      orderBy: z
        .enum(['name', 'modifiedTime', 'createdTime'])
        .optional()
        .default('modifiedTime')
        .describe('Sort order for results.'),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(
        `Listing Google Docs. Query: ${args.query || 'none'}, Max: ${args.maxResults}, Order: ${args.orderBy}`
      );

      try {
        // Build the query string for Google Drive API
        let queryString = "mimeType='application/vnd.google-apps.document' and trashed=false";
        if (args.query) {
          queryString += ` and (name contains '${args.query}' or fullText contains '${args.query}')`;
        }

        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: args.orderBy === 'name' ? 'name' : args.orderBy,
          fields:
            'files(id,name,modifiedTime,createdTime,size,webViewLink,owners(displayName,emailAddress))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];

        if (files.length === 0) {
          return 'No Google Docs found matching your criteria.';
        }

        let result = `Found ${files.length} Google Document(s):\n\n`;
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
        log.error(`Error listing Google Docs: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        throw new UserError(`Failed to list documents: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
