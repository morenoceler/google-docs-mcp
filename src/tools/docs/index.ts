import type { FastMCP } from 'fastmcp';

// Core read/write
import { register as readGoogleDoc } from './readGoogleDoc.js';
import { register as listDocumentTabs } from './listDocumentTabs.js';
import { register as appendToGoogleDoc } from './appendToGoogleDoc.js';
import { register as insertText } from './insertText.js';
import { register as deleteRange } from './deleteRange.js';

// Structure
import { register as insertTable } from './insertTable.js';
import { register as editTableCell } from './editTableCell.js';
import { register as insertPageBreak } from './insertPageBreak.js';
import { register as insertImageFromUrl } from './insertImageFromUrl.js';
import { register as insertLocalImage } from './insertLocalImage.js';
import { register as fixListFormatting } from './fixListFormatting.js';
import { register as findElement } from './findElement.js';

// Sub-domains
import { registerCommentTools } from './comments/index.js';
import { registerFormattingTools } from './formatting/index.js';

export function registerDocsTools(server: FastMCP) {
  // Core read/write
  readGoogleDoc(server);
  listDocumentTabs(server);
  appendToGoogleDoc(server);
  insertText(server);
  deleteRange(server);

  // Structure
  insertTable(server);
  editTableCell(server);
  insertPageBreak(server);
  insertImageFromUrl(server);
  insertLocalImage(server);
  fixListFormatting(server);
  findElement(server);

  // Sub-domains
  registerFormattingTools(server);
  registerCommentTools(server);
}
