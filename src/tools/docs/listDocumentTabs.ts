import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'listDocumentTabs',
    description:
      'Lists all tabs in a Google Document, including their hierarchy, IDs, and structure.',
    parameters: DocumentIdParameter.extend({
      includeContent: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Whether to include a content summary for each tab (character count).'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(`Listing tabs for document: ${args.documentId}`);

      try {
        // Get document with tabs structure
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          // Only get essential fields for tab listing
          fields: args.includeContent
            ? 'title,tabs' // Get all tab data if we need content summary
            : 'title,tabs(tabProperties,childTabs)', // Otherwise just structure
        });

        const docTitle = res.data.title || 'Untitled Document';

        // Get all tabs in a flat list with hierarchy info
        const allTabs = GDocsHelpers.getAllTabs(res.data);

        if (allTabs.length === 0) {
          // Shouldn't happen with new structure, but handle edge case
          return `Document "${docTitle}" appears to have no tabs (unexpected).`;
        }

        // Check if it's a single-tab or multi-tab document
        const isSingleTab = allTabs.length === 1;

        // Format the output
        let result = `**Document:** "${docTitle}"\n`;
        result += `**Total tabs:** ${allTabs.length}`;
        result += isSingleTab ? ' (single-tab document)\n\n' : '\n\n';

        if (!isSingleTab) {
          result += `**Tab Structure:**\n`;
          result += `${'─'.repeat(50)}\n\n`;
        }

        allTabs.forEach((tab: GDocsHelpers.TabWithLevel, index: number) => {
          const level = tab.level;
          const tabProperties = tab.tabProperties || {};
          const indent = '  '.repeat(level);

          // For single tab documents, show simplified info
          if (isSingleTab) {
            result += `**Default Tab:**\n`;
            result += `- Tab ID: ${tabProperties.tabId || 'Unknown'}\n`;
            result += `- Title: ${tabProperties.title || '(Untitled)'}\n`;
          } else {
            // For multi-tab documents, show hierarchy
            const prefix = level > 0 ? '└─ ' : '';
            result += `${indent}${prefix}**Tab ${index + 1}:** "${tabProperties.title || 'Untitled Tab'}"\n`;
            result += `${indent}   - ID: ${tabProperties.tabId || 'Unknown'}\n`;
            result += `${indent}   - Index: ${tabProperties.index !== undefined ? tabProperties.index : 'N/A'}\n`;

            if (tabProperties.parentTabId) {
              result += `${indent}   - Parent Tab ID: ${tabProperties.parentTabId}\n`;
            }
          }

          // Optionally include content summary
          if (args.includeContent && tab.documentTab) {
            const textLength = GDocsHelpers.getTabTextLength(tab.documentTab);
            const contentInfo =
              textLength > 0
                ? `${textLength.toLocaleString()} characters`
                : 'Empty';
            result += `${indent}   - Content: ${contentInfo}\n`;
          }

          if (!isSingleTab) {
            result += '\n';
          }
        });

        // Add usage hint for multi-tab documents
        if (!isSingleTab) {
          result += `\n💡 **Tip:** Use tab IDs with other tools to target specific tabs.`;
        }

        return result;
      } catch (error: any) {
        log.error(
          `Error listing tabs for doc ${args.documentId}: ${error.message || error}`
        );
        if (error.code === 404)
          throw new UserError(
            `Document not found (ID: ${args.documentId}).`
          );
        if (error.code === 403)
          throw new UserError(
            `Permission denied for document (ID: ${args.documentId}).`
          );
        throw new UserError(
          `Failed to list tabs: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
