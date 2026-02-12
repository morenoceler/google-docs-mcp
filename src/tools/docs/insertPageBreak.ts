import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertPageBreak',
    description: 'Inserts a page break at the specified index.',
    parameters: DocumentIdParameter.extend({
      index: z
        .number()
        .int()
        .min(1)
        .describe('The index (1-based) where the page break should be inserted.'),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(`Inserting page break in doc ${args.documentId} at index ${args.index}`);
      try {
        const request: docs_v1.Schema$Request = {
          insertPageBreak: {
            location: { index: args.index },
          },
        };
        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
        return `Successfully inserted page break at index ${args.index}.`;
      } catch (error: any) {
        log.error(
          `Error inserting page break in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert page break: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
