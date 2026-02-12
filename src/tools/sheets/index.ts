import type { FastMCP } from 'fastmcp';
import { register as readSpreadsheet } from './readSpreadsheet.js';
import { register as writeSpreadsheet } from './writeSpreadsheet.js';
import { register as appendSpreadsheetRows } from './appendSpreadsheetRows.js';
import { register as clearSpreadsheetRange } from './clearSpreadsheetRange.js';
import { register as getSpreadsheetInfo } from './getSpreadsheetInfo.js';
import { register as addSpreadsheetSheet } from './addSpreadsheetSheet.js';
import { register as createSpreadsheet } from './createSpreadsheet.js';
import { register as listGoogleSheets } from './listGoogleSheets.js';

export function registerSheetsTools(server: FastMCP) {
  readSpreadsheet(server);
  writeSpreadsheet(server);
  appendSpreadsheetRows(server);
  clearSpreadsheetRange(server);
  getSpreadsheetInfo(server);
  addSpreadsheetSheet(server);
  createSpreadsheet(server);
  listGoogleSheets(server);
}
