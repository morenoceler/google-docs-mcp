import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertTable',
    description: 'Inserts a new table with the specified dimensions at a given index.',
    parameters: DocumentIdParameter.extend({
      rows: z.number().int().min(1).describe('Number of rows for the new table.'),
      columns: z.number().int().min(1).describe('Number of columns for the new table.'),
      index: z
        .number()
        .int()
        .min(1)
        .describe('The index (1-based) where the table should be inserted.'),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Inserting ${args.rows}x${args.columns} table in doc ${args.documentId} at index ${args.index}`
      );
      try {
        await GDocsHelpers.createTable(docs, args.documentId, args.rows, args.columns, args.index);
        // The API response contains info about the created table, but might be too complex to return here.
        return `Successfully inserted a ${args.rows}x${args.columns} table at index ${args.index}.`;
      } catch (error: any) {
        log.error(`Error inserting table in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert table: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
