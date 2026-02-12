import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, MarkdownConversionError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { convertMarkdownToRequests } from '../../markdownToGoogleDocs.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'appendMarkdownToGoogleDoc',
    description:
      'Appends markdown content to the end of a Google Document with full formatting. Supports headings, bold, italic, strikethrough, links, and lists.',
    parameters: DocumentIdParameter.extend({
      markdown: z
        .string()
        .min(1)
        .describe('The markdown content to append.'),
      addNewlineIfNeeded: z
        .boolean()
        .optional()
        .default(true)
        .describe('Add spacing before appended content if needed.'),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to append to. If not specified, appends to the first tab.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Appending markdown to doc ${args.documentId} (${args.markdown.length} chars)${args.tabId ? ` in tab ${args.tabId}` : ''}`
      );

      try {
        // 1. Get document end index
        const doc = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: !!args.tabId,
          fields: args.tabId ? 'tabs' : 'body(content(endIndex))',
        });

        let bodyContent: any;

        if (args.tabId) {
          const targetTab = GDocsHelpers.findTabById(doc.data, args.tabId);
          if (!targetTab) {
            throw new UserError(
              `Tab with ID "${args.tabId}" not found in document.`
            );
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

        let startIndex = bodyContent[bodyContent.length - 1].endIndex! - 1;
        log.info(`Document end index: ${startIndex}`);

        // 2. Add spacing if needed
        if (args.addNewlineIfNeeded && startIndex > 1) {
          const location: any = { index: startIndex };
          if (args.tabId) {
            location.tabId = args.tabId;
          }
          await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [
            {
              insertText: {
                location,
                text: '\n\n',
              },
            },
          ]);
          startIndex += 2;
          log.info(`Added spacing, new start index: ${startIndex}`);
        }

        // 3. Convert and append markdown
        const markdownRequests = convertMarkdownToRequests(
          args.markdown,
          startIndex,
          args.tabId
        );
        log.info(
          `Generated ${markdownRequests.length} requests from markdown`
        );

        await GDocsHelpers.executeBatchUpdateWithSplitting(
          docs,
          args.documentId,
          markdownRequests,
          log
        );

        log.info(`Successfully appended markdown`);
        return `Successfully appended ${args.markdown.length} characters of markdown (${markdownRequests.length} operations).`;
      } catch (error: any) {
        log.error(`Error appending markdown: ${error.message}`);
        if (
          error instanceof UserError ||
          error instanceof MarkdownConversionError
        ) {
          throw error;
        }
        throw new UserError(
          `Failed to append markdown: ${error.message}`
        );
      }
    },
  });
}
