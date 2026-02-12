import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { google } from 'googleapis';
import { getAuthClient } from '../../../clients.js';
import { DocumentIdParameter } from '../../../types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getComment',
    description: 'Gets a specific comment with its full thread of replies.',
    parameters: DocumentIdParameter.extend({
      commentId: z.string().describe('The ID of the comment to retrieve'),
    }),
    execute: async (args, { log }) => {
      log.info(`Getting comment ${args.commentId} from document ${args.documentId}`);

      try {
        const authClient = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });
        const response = await drive.comments.get({
          fileId: args.documentId,
          commentId: args.commentId,
          fields:
            'id,content,quotedFileContent,author,createdTime,resolved,replies(id,content,author,createdTime)',
        });

        const comment = response.data;
        const author = comment.author?.displayName || 'Unknown';
        const date = comment.createdTime
          ? new Date(comment.createdTime).toLocaleDateString()
          : 'Unknown date';
        const status = comment.resolved ? ' [RESOLVED]' : '';
        const quotedText = comment.quotedFileContent?.value || 'No quoted text';
        const anchor = quotedText !== 'No quoted text' ? `\nAnchored to: "${quotedText}"` : '';

        let result = `**${author}** (${date})${status}${anchor}\n${comment.content}`;

        // Add replies if any
        if (comment.replies && comment.replies.length > 0) {
          result += '\n\n**Replies:**';
          comment.replies.forEach((reply: any, index: number) => {
            const replyAuthor = reply.author?.displayName || 'Unknown';
            const replyDate = reply.createdTime
              ? new Date(reply.createdTime).toLocaleDateString()
              : 'Unknown date';
            result += `\n${index + 1}. **${replyAuthor}** (${replyDate})\n   ${reply.content}`;
          });
        }

        return result;
      } catch (error: any) {
        log.error(`Error getting comment: ${error.message || error}`);
        throw new UserError(`Failed to get comment: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
