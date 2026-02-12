import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, MarkdownConversionError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { convertMarkdownToRequests } from '../../markdownToGoogleDocs.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'replaceDocumentWithMarkdown',
    description:
      'Replaces the entire content of a Google Document with markdown-formatted content. Supports headings (# H1-###### H6), bold (**bold**), italic (*italic*), strikethrough (~~strike~~), links ([text](url)), and lists (bullet and numbered).',
    parameters: DocumentIdParameter.extend({
      markdown: z.string().min(1).describe('The markdown content to apply to the document.'),
      preserveTitle: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, preserves the first heading/title and replaces content after it.'),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to replace content in. If not specified, replaces content in the first tab.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Replacing doc ${args.documentId} with markdown (${args.markdown.length} chars)${args.tabId ? ` in tab ${args.tabId}` : ''}`
      );

      try {
        // 1. Get document structure
        const doc = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: !!args.tabId,
          fields: args.tabId ? 'tabs' : 'body(content(startIndex,endIndex))',
        });

        // 2. Calculate replacement range
        let startIndex = 1;
        let bodyContent: any;

        if (args.tabId) {
          const targetTab = GDocsHelpers.findTabById(doc.data, args.tabId);
          if (!targetTab) {
            throw new UserError(`Tab with ID "${args.tabId}" not found in document.`);
          }
          if (!targetTab.documentTab) {
            throw new UserError(
              `Tab "${args.tabId}" does not have content (may not be a document tab).`
            );
          }
          bodyContent = targetTab.documentTab.body?.content;
        } else {
          bodyContent = doc.data.body?.content;
        }

        if (!bodyContent) {
          throw new UserError('No content found in document/tab');
        }

        let endIndex = bodyContent[bodyContent.length - 1].endIndex! - 1;

        if (args.preserveTitle) {
          // Find first content element that's a heading or paragraph
          for (const element of bodyContent) {
            if (element.paragraph && element.endIndex) {
              startIndex = element.endIndex;
              break;
            }
          }
        }

        // 3. Delete existing content FIRST in a separate API call
        if (endIndex > startIndex) {
          const deleteRange: any = { startIndex, endIndex };
          if (args.tabId) {
            deleteRange.tabId = args.tabId;
          }
          log.info(`Deleting content from index ${startIndex} to ${endIndex} (separate API call)`);
          await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
            {
              deleteContentRange: { range: deleteRange },
            },
          ]);
          log.info(`Delete complete. Document now empty.`);
        }

        // 4. Convert markdown to requests (indices calculated for empty document)
        log.info(
          `Converting markdown starting at index ${startIndex} (after delete, document should be empty)`
        );
        const markdownRequests = convertMarkdownToRequests(args.markdown, startIndex, args.tabId);
        log.info(`Generated ${markdownRequests.length} requests from markdown`);
        log.info(`First 3 requests: ${JSON.stringify(markdownRequests.slice(0, 3), null, 2)}`);

        // 5. Execute markdown requests (insert + format) in separate API call(s)
        await GDocsHelpers.executeBatchUpdateWithSplitting(
          docs,
          args.documentId,
          markdownRequests,
          log
        );

        log.info(`Successfully replaced document content`);
        return `Successfully replaced document content with ${args.markdown.length} characters of markdown (${markdownRequests.length} operations).`;
      } catch (error: any) {
        log.error(`Error replacing document with markdown: ${error.message}`);
        if (error instanceof UserError || error instanceof MarkdownConversionError) {
          throw error;
        }
        throw new UserError(`Failed to apply markdown: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
