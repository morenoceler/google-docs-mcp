import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter, OptionalRangeParameters, NotImplementedError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'fixListFormatting',
    description:
      'EXPERIMENTAL: Attempts to detect paragraphs that look like lists (e.g., starting with -, *, 1.) and convert them to proper Google Docs bulleted or numbered lists. Best used on specific sections.',
    parameters: DocumentIdParameter.extend({
      // Optional range to limit the scope, otherwise scans whole doc (potentially slow/risky)
      range: OptionalRangeParameters.optional().describe(
        'Optional: Limit the fixing process to a specific range.'
      ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.warn(
        `Executing EXPERIMENTAL fixListFormatting for doc ${args.documentId}. Range: ${JSON.stringify(args.range)}`
      );
      try {
        await GDocsHelpers.detectAndFormatLists(
          docs,
          args.documentId,
          args.range?.startIndex,
          args.range?.endIndex
        );
        return `Attempted to fix list formatting. Please review the document for accuracy.`;
      } catch (error: any) {
        log.error(
          `Error fixing list formatting in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        if (error instanceof NotImplementedError) throw error; // Expected if helper not implemented
        throw new UserError(`Failed to fix list formatting: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
