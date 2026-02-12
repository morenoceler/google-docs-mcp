import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'clearSpreadsheetRange',
    description: 'Clears all values from a specific range in a Google Spreadsheet.',
    parameters: z.object({
      spreadsheetId: z.string().describe('The ID of the Google Spreadsheet (from the URL).'),
      range: z.string().describe('A1 notation range to clear (e.g., "A1:B10" or "Sheet1!A1:B10").'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Clearing range ${args.range} in spreadsheet ${args.spreadsheetId}`);

      try {
        const response = await SheetsHelpers.clearRange(sheets, args.spreadsheetId, args.range);
        const clearedRange = response.clearedRange || args.range;

        return `Successfully cleared range ${clearedRange}.`;
      } catch (error: any) {
        log.error(
          `Error clearing range in spreadsheet ${args.spreadsheetId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to clear range: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
