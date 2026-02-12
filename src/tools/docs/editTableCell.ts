import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import {
  DocumentIdParameter,
  TextStyleParameters,
  ParagraphStyleParameters,
  NotImplementedError,
} from '../../types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'editTableCell',
    description:
      'Edits the content and/or basic style of a specific table cell. Requires knowing table start index.',
    parameters: DocumentIdParameter.extend({
      tableStartIndex: z
        .number()
        .int()
        .min(1)
        .describe(
          'The starting index of the TABLE element itself (tricky to find, may require reading structure first).'
        ),
      rowIndex: z.number().int().min(0).describe('Row index (0-based).'),
      columnIndex: z.number().int().min(0).describe('Column index (0-based).'),
      textContent: z
        .string()
        .optional()
        .describe('Optional: New text content for the cell. Replaces existing content.'),
      // Combine basic styles for simplicity here. More advanced cell styling might need separate tools.
      textStyle: TextStyleParameters.optional().describe('Optional: Text styles to apply.'),
      paragraphStyle: ParagraphStyleParameters.optional().describe(
        'Optional: Paragraph styles (like alignment) to apply.'
      ),
      // cellBackgroundColor: z.string().optional()... // Cell-specific styles are complex
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Editing cell (${args.rowIndex}, ${args.columnIndex}) in table starting at ${args.tableStartIndex}, doc ${args.documentId}`
      );

      // TODO: Implement complex logic
      // 1. Find the cell's content range based on tableStartIndex, rowIndex, columnIndex. This is NON-TRIVIAL.
      //    Requires getting the document, finding the table element, iterating through rows/cells to calculate indices.
      // 2. If textContent is provided, generate a DeleteContentRange request for the cell's current content.
      // 3. Generate an InsertText request for the new textContent at the cell's start index.
      // 4. If textStyle is provided, generate UpdateTextStyle requests for the new text range.
      // 5. If paragraphStyle is provided, generate UpdateParagraphStyle requests for the cell's paragraph range.
      // 6. Execute batch update.

      log.error('editTableCell is not implemented due to complexity of finding cell indices.');
      throw new NotImplementedError('Editing table cells is complex and not yet implemented.');
      // return `Edit request for cell (${args.rowIndex}, ${args.columnIndex}) submitted (Not Implemented).`;
    },
  });
}
