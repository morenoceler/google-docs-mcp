import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'readSpreadsheet',
    description: 'Reads data from a specific range in a Google Spreadsheet.',
    parameters: z.object({
      spreadsheetId: z.string().describe('The ID of the Google Spreadsheet (from the URL).'),
      range: z.string().describe('A1 notation range to read (e.g., "A1:B10" or "Sheet1!A1:B10").'),
      valueRenderOption: z
        .enum(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])
        .optional()
        .default('FORMATTED_VALUE')
        .describe('How values should be rendered in the output.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Reading spreadsheet ${args.spreadsheetId}, range: ${args.range}`);

      try {
        const response = await SheetsHelpers.readRange(sheets, args.spreadsheetId, args.range);
        const values = response.values || [];

        if (values.length === 0) {
          return `Range ${args.range} is empty or does not exist.`;
        }

        // Format as a readable table
        let result = `**Spreadsheet Range:** ${args.range}\n\n`;
        values.forEach((row, index) => {
          result += `Row ${index + 1}: ${JSON.stringify(row)}\n`;
        });

        return result;
      } catch (error: any) {
        log.error(`Error reading spreadsheet ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to read spreadsheet: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
