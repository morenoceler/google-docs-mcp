import type { FastMCP } from 'fastmcp';

import { register as applyTextStyle } from './applyTextStyle.js';
import { register as applyParagraphStyle } from './applyParagraphStyle.js';
import { register as formatMatchingText } from './formatMatchingText.js';

export function registerFormattingTools(server: FastMCP) {
  applyTextStyle(server);
  applyParagraphStyle(server);
  formatMatchingText(server);
}
