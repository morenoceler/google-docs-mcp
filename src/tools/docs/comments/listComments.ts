import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { google } from 'googleapis';
import { getDocsClient, getDriveClient, getAuthClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listComments',
    description: 'Lists all comments in a Google Document.',
    parameters: DocumentIdParameter,
    execute: async (args, { log }) => {
      log.info(`Listing comments for document ${args.documentId}`);
      const docsClient = await getDocsClient();
      const driveClient = await getDriveClient();

      try {
        // First get the document to have context
        const doc = await docsClient.documents.get({ documentId: args.documentId });

        // Use Drive API v3 with proper fields to get quoted content
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });
        const response = await drive.comments.list({
          fileId: args.documentId,
          fields: 'comments(id,content,quotedFileContent,author,createdTime,resolved)',
          pageSize: 100,
        });

        const comments = response.data.comments || [];

        if (comments.length === 0) {
          return 'No comments found in this document.';
        }

        // Format comments for display
        const formattedComments = comments
          .map((comment: any, index: number) => {
            const replies = comment.replies?.length || 0;
            const status = comment.resolved ? ' [RESOLVED]' : '';
            const author = comment.author?.displayName || 'Unknown';
            const date = comment.createdTime
              ? new Date(comment.createdTime).toLocaleDateString()
              : 'Unknown date';

            // Get the actual quoted text content
            const quotedText = comment.quotedFileContent?.value || 'No quoted text';
            const anchor =
              quotedText !== 'No quoted text'
                ? ` (anchored to: "${quotedText.substring(0, 100)}${quotedText.length > 100 ? '...' : ''}")`
                : '';

            let result = `\n${index + 1}. **${author}** (${date})${status}${anchor}\n   ${comment.content}`;

            if (replies > 0) {
              result += `\n   └─ ${replies} ${replies === 1 ? 'reply' : 'replies'}`;
            }

            result += `\n   Comment ID: ${comment.id}`;

            return result;
          })
          .join('\n');

        return `Found ${comments.length} comment${comments.length === 1 ? '' : 's'}:\n${formattedComments}`;
      } catch (error: any) {
        log.error(`Error listing comments: ${error.message || error}`);
        throw new UserError(`Failed to list comments: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
