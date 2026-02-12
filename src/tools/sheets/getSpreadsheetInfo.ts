import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'getSpreadsheetInfo',
    description: 'Gets detailed information about a Google Spreadsheet including all sheets/tabs.',
    parameters: z.object({
      spreadsheetId: z.string().describe('The ID of the Google Spreadsheet (from the URL).'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Getting info for spreadsheet: ${args.spreadsheetId}`);

      try {
        const metadata = await SheetsHelpers.getSpreadsheetMetadata(sheets, args.spreadsheetId);

        let result = `**Spreadsheet Information:**\n\n`;
        result += `**Title:** ${metadata.properties?.title || 'Untitled'}\n`;
        result += `**ID:** ${metadata.spreadsheetId}\n`;
        result += `**URL:** https://docs.google.com/spreadsheets/d/${metadata.spreadsheetId}\n\n`;

        const sheetList = metadata.sheets || [];
        result += `**Sheets (${sheetList.length}):**\n`;
        sheetList.forEach((sheet, index) => {
          const props = sheet.properties;
          result += `${index + 1}. **${props?.title || 'Untitled'}**\n`;
          result += `   - Sheet ID: ${props?.sheetId}\n`;
          result += `   - Grid: ${props?.gridProperties?.rowCount || 0} rows × ${props?.gridProperties?.columnCount || 0} columns\n`;
          if (props?.hidden) {
            result += `   - Status: Hidden\n`;
          }
          result += `\n`;
        });

        return result;
      } catch (error: any) {
        log.error(`Error getting spreadsheet info ${args.spreadsheetId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to get spreadsheet info: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
