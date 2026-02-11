import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'setDropdownValidation',
    description:
      'Adds a dropdown list to a range of cells, restricting input to the specified values. Use this to create status columns, category selectors, or any fixed-choice field.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      range: z
        .string()
        .describe(
          'A1 notation range to apply the dropdown to (e.g., "Sheet1!B2:B100" or "C2:C50").'
        ),
      values: z
        .array(z.string())
        .min(1)
        .describe(
          'The allowed dropdown options (e.g., ["Open", "In Progress", "Done"]).'
        ),
      strict: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true, reject input that does not match one of the dropdown values.'),
      inputMessage: z
        .string()
        .optional()
        .describe('Help text shown when a cell with the dropdown is selected.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(
        `Setting dropdown validation on "${args.range}" with ${args.values.length} options in spreadsheet ${args.spreadsheetId}`
      );

      try {
        await SheetsHelpers.setDropdownValidation(
          sheets,
          args.spreadsheetId,
          args.range,
          args.values,
          args.strict,
          args.inputMessage
        );

        return `Successfully added dropdown validation to range "${args.range}" with ${args.values.length} options: ${args.values.join(', ')}.`;
      } catch (error: any) {
        log.error(`Error setting dropdown validation: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to set dropdown validation: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
