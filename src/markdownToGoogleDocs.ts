// src/markdownToGoogleDocs.ts
import { docs_v1 } from 'googleapis';
import type Token from 'markdown-it/lib/token.mjs';
import { parseMarkdown, getLinkHref, getHeadingLevel } from './markdownParser.js';
import {
  buildUpdateTextStyleRequest,
  buildUpdateParagraphStyleRequest,
} from './googleDocsApiHelpers.js';
import { MarkdownConversionError } from './types.js';

// --- Internal Types ---

interface TextRange {
  startIndex: number;
  endIndex: number;
  formatting: FormattingState;
}

interface FormattingState {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  link?: string;
  code?: boolean;
}

interface ParagraphRange {
  startIndex: number;
  endIndex: number;
  namedStyleType?: string;
}

interface ListState {
  type: 'bullet' | 'ordered';
  level: number;
}

interface PendingListItem {
  startIndex: number;
  endIndex?: number;
  nestingLevel: number;
  bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN' | 'BULLET_DISC_CIRCLE_SQUARE' | 'BULLET_CHECKBOX';
  taskPrefixProcessed: boolean;
}

interface ConversionContext {
  currentIndex: number;
  insertRequests: docs_v1.Schema$Request[];
  formatRequests: docs_v1.Schema$Request[];
  textRanges: TextRange[];
  formattingStack: FormattingState[];
  listStack: ListState[];
  paragraphRanges: ParagraphRange[];
  pendingListItems: PendingListItem[];
  openListItemStack: number[];
  hrRanges: { startIndex: number; endIndex: number }[];
  tabId?: string;
  currentParagraphStart?: number;
  currentHeadingLevel?: number;
}

const CODE_FONT_FAMILY = 'Roboto Mono';
const CODE_TEXT_HEX = '#188038';
const CODE_BACKGROUND_HEX = '#F1F3F4';

// --- Main Conversion Function ---

/**
 * Converts markdown text to Google Docs API batch update requests
 *
 * @param markdown - The markdown content to convert
 * @param startIndex - The document index where content should be inserted (1-based)
 * @param tabId - Optional tab ID for multi-tab documents
 * @returns Array of Google Docs API requests (insertions + formatting)
 */
export function convertMarkdownToRequests(
  markdown: string,
  startIndex: number = 1,
  tabId?: string
): docs_v1.Schema$Request[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const parsed = parseMarkdown(markdown);

  const context: ConversionContext = {
    currentIndex: startIndex,
    insertRequests: [],
    formatRequests: [],
    textRanges: [],
    formattingStack: [],
    listStack: [],
    paragraphRanges: [],
    pendingListItems: [],
    openListItemStack: [],
    hrRanges: [],
    tabId,
  };

  try {
    // Process all tokens
    for (const token of parsed.tokens) {
      processToken(token, context);
    }

    // Finalize any pending formatting
    finalizeFormatting(context);

    // Return all requests: insertions first, then formatting
    return [...context.insertRequests, ...context.formatRequests];
  } catch (error) {
    if (error instanceof MarkdownConversionError) {
      throw error;
    }
    throw new MarkdownConversionError(
      `Failed to convert markdown: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// --- Token Processing ---

function processToken(token: Token, context: ConversionContext): void {
  switch (token.type) {
    // Headings
    case 'heading_open':
      handleHeadingOpen(token, context);
      break;
    case 'heading_close':
      handleHeadingClose(context);
      break;

    // Paragraphs
    case 'paragraph_open':
      handleParagraphOpen(context);
      break;
    case 'paragraph_close':
      handleParagraphClose(context);
      break;

    // Text content
    case 'text':
      handleTextToken(token, context);
      break;
    case 'code_inline':
      handleCodeInlineToken(token, context);
      break;

    // Inline formatting
    case 'strong_open':
      context.formattingStack.push({ bold: true });
      break;
    case 'strong_close':
      popFormatting(context, 'bold');
      break;

    case 'em_open':
      context.formattingStack.push({ italic: true });
      break;
    case 'em_close':
      popFormatting(context, 'italic');
      break;

    case 's_open':
      context.formattingStack.push({ strikethrough: true });
      break;
    case 's_close':
      popFormatting(context, 'strikethrough');
      break;

    // Links
    case 'link_open':
      const href = getLinkHref(token);
      if (href) {
        context.formattingStack.push({ link: href });
      }
      break;
    case 'link_close':
      popFormatting(context, 'link');
      break;

    // Lists
    case 'bullet_list_open':
      context.listStack.push({
        type: 'bullet',
        level: context.listStack.length,
      });
      break;
    case 'bullet_list_close':
      context.listStack.pop();
      break;

    case 'ordered_list_open':
      context.listStack.push({
        type: 'ordered',
        level: context.listStack.length,
      });
      break;
    case 'ordered_list_close':
      context.listStack.pop();
      break;

    case 'list_item_open':
      handleListItemOpen(context);
      break;
    case 'list_item_close':
      handleListItemClose(context);
      break;

    // Soft breaks and hard breaks
    case 'softbreak':
      insertText(' ', context);
      break;
    case 'hardbreak':
      insertText('\n', context);
      break;

    // Inline elements (like inline code)
    case 'inline':
      if (token.children) {
        for (const child of token.children) {
          processToken(child, context);
        }
      }
      break;

    // Tables (basic support)
    case 'table_open':
      // Tables are complex - we'll skip for now and add in a future enhancement
      // throw new MarkdownConversionError('Table conversion not yet implemented');
      break;

    // Ignore these tokens (structural)
    case 'tbody_open':
    case 'tbody_close':
    case 'thead_open':
    case 'thead_close':
    case 'tr_open':
    case 'tr_close':
    case 'th_open':
    case 'th_close':
    case 'td_open':
    case 'td_close':
    case 'table_close':
    case 'fence':
    case 'code_block':
      handleCodeBlockToken(token, context);
      break;
    case 'hr':
      handleHorizontalRule(context);
      break;
    case 'blockquote_open':
    case 'blockquote_close':
      // Skip for now - can be added in future enhancements
      break;

    default:
      // console.warn(`Unhandled token type: ${token.type}`);
      break;
  }
}

// --- Heading Handlers ---

function handleHeadingOpen(token: Token, context: ConversionContext): void {
  const level = getHeadingLevel(token);
  if (level) {
    context.currentHeadingLevel = level;
    context.currentParagraphStart = context.currentIndex;
  }
}

function handleHeadingClose(context: ConversionContext): void {
  if (context.currentHeadingLevel && context.currentParagraphStart !== undefined) {
    const headingStyleType = `HEADING_${context.currentHeadingLevel}`;
    context.paragraphRanges.push({
      startIndex: context.currentParagraphStart,
      endIndex: context.currentIndex,
      namedStyleType: headingStyleType,
    });

    // Add newline after heading
    insertText('\n', context);

    context.currentHeadingLevel = undefined;
    context.currentParagraphStart = undefined;
  }
}

// --- Horizontal Rule Handler ---

function handleHorizontalRule(context: ConversionContext): void {
  // Ensure separation from previous content
  if (!lastInsertEndsWithNewline(context)) {
    insertText('\n', context);
  }

  // Insert an empty paragraph that will carry the bottom border
  const start = context.currentIndex;
  insertText('\n', context);

  context.hrRanges.push({
    startIndex: start,
    endIndex: context.currentIndex,
  });
}

// --- Paragraph Handlers ---

function handleParagraphOpen(context: ConversionContext): void {
  // Skip if we're in a list - list items handle their own paragraphs
  if (context.listStack.length === 0) {
    context.currentParagraphStart = context.currentIndex;
  }
}

function handleParagraphClose(context: ConversionContext): void {
  if (context.listStack.length === 0) {
    // Add double newline after non-list paragraphs for spacing.
    insertText('\n\n', context);
  } else if (!lastInsertEndsWithNewline(context)) {
    // End each list paragraph explicitly so nested list items don't collapse
    // into their parent item text.
    insertText('\n', context);
  }

  const currentListItem = getCurrentOpenListItem(context);
  if (currentListItem) {
    const paragraphEndIndex = lastInsertEndsWithNewline(context)
      ? context.currentIndex - 1
      : context.currentIndex;
    if (paragraphEndIndex > currentListItem.startIndex) {
      currentListItem.endIndex = paragraphEndIndex;
    }
  }
  context.currentParagraphStart = undefined;
}

// --- List Handlers ---

function handleListItemOpen(context: ConversionContext): void {
  if (context.listStack.length === 0) {
    throw new MarkdownConversionError('List item found outside of list context');
  }

  const currentList = context.listStack[context.listStack.length - 1];
  const itemStart = context.currentIndex;

  // Docs API uses leading tabs to infer list nesting levels.
  if (currentList.level > 0) {
    insertText('\t'.repeat(currentList.level), context);
  }

  const listItem: PendingListItem = {
    startIndex: itemStart,
    nestingLevel: currentList.level,
    bulletPreset:
      currentList.type === 'ordered' ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
    taskPrefixProcessed: false,
  };
  context.pendingListItems.push(listItem);
  context.openListItemStack.push(context.pendingListItems.length - 1);
}

function handleListItemClose(context: ConversionContext): void {
  const openIndex = context.openListItemStack.pop();
  if (openIndex === undefined) {
    return;
  }

  const listItem = context.pendingListItems[openIndex];
  if (listItem.endIndex === undefined) {
    const computedEndIndex = lastInsertEndsWithNewline(context)
      ? context.currentIndex - 1
      : context.currentIndex;
    if (computedEndIndex > listItem.startIndex) {
      listItem.endIndex = computedEndIndex;
    }
  }

  if (!lastInsertEndsWithNewline(context)) {
    insertText('\n', context);
  }
}

// --- Text Handling ---

function handleTextToken(token: Token, context: ConversionContext): void {
  let text = token.content;
  if (!text) return;

  const currentListItem = getCurrentOpenListItem(context);
  if (currentListItem && !currentListItem.taskPrefixProcessed) {
    currentListItem.taskPrefixProcessed = true;
    const taskPrefixMatch = text.match(/^\[( |x|X)\]\s+/);
    if (taskPrefixMatch) {
      currentListItem.bulletPreset = 'BULLET_CHECKBOX';
      text = text.slice(taskPrefixMatch[0].length);
      if (!text) return;
    }
  }

  const startIndex = context.currentIndex;
  const endIndex = startIndex + text.length;

  // Insert the text
  insertText(text, context);

  // Track formatting for this range
  const currentFormatting = mergeFormattingStack(context.formattingStack);
  if (hasFormatting(currentFormatting)) {
    context.textRanges.push({
      startIndex,
      endIndex,
      formatting: currentFormatting,
    });
  }
}

function handleCodeInlineToken(token: Token, context: ConversionContext): void {
  context.formattingStack.push({ code: true });
  handleTextToken(token, context);
  popFormatting(context, 'code');
}

function handleCodeBlockToken(token: Token, context: ConversionContext): void {
  const normalizedContent = token.content.endsWith('\n')
    ? token.content.slice(0, -1)
    : token.content;
  const lines = normalizedContent.length > 0 ? normalizedContent.split('\n') : [''];

  for (const line of lines) {
    const startIndex = context.currentIndex;
    if (line.length > 0) {
      insertText(line, context);
      context.textRanges.push({
        startIndex,
        endIndex: context.currentIndex,
        formatting: { code: true },
      });
    } else {
      // Keep blank lines inside fenced blocks visible.
      insertText(' ', context);
      context.textRanges.push({
        startIndex,
        endIndex: context.currentIndex,
        formatting: { code: true },
      });
    }
    insertText('\n', context);
  }

  if (!lastInsertEndsWithDoubleNewline(context)) {
    insertText('\n', context);
  }
}

function insertText(text: string, context: ConversionContext): void {
  const location: any = { index: context.currentIndex };
  if (context.tabId) {
    location.tabId = context.tabId;
  }

  context.insertRequests.push({
    insertText: {
      location,
      text,
    },
  });

  context.currentIndex += text.length;
}

// --- Formatting Stack Management ---

function mergeFormattingStack(stack: FormattingState[]): FormattingState {
  const merged: FormattingState = {};

  for (const state of stack) {
    if (state.bold !== undefined) merged.bold = state.bold;
    if (state.italic !== undefined) merged.italic = state.italic;
    if (state.strikethrough !== undefined) merged.strikethrough = state.strikethrough;
    if (state.code !== undefined) merged.code = state.code;
    if (state.link !== undefined) merged.link = state.link;
  }

  return merged;
}

function hasFormatting(formatting: FormattingState): boolean {
  return (
    formatting.bold === true ||
    formatting.italic === true ||
    formatting.strikethrough === true ||
    formatting.code === true ||
    formatting.link !== undefined
  );
}

function popFormatting(context: ConversionContext, type: keyof FormattingState): void {
  // Find and remove the last formatting state with this type
  for (let i = context.formattingStack.length - 1; i >= 0; i--) {
    if (context.formattingStack[i][type] !== undefined) {
      context.formattingStack.splice(i, 1);
      break;
    }
  }
}

// --- Finalization ---

function finalizeFormatting(context: ConversionContext): void {
  // Apply character-level formatting
  for (const range of context.textRanges) {
    const rangeLocation: docs_v1.Schema$Range = {
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    };
    if (context.tabId) {
      rangeLocation.tabId = context.tabId;
    }

    // Apply text style (bold, italic, strikethrough, inline/block code).
    if (
      range.formatting.bold ||
      range.formatting.italic ||
      range.formatting.strikethrough ||
      range.formatting.code
    ) {
      const styleRequest = buildUpdateTextStyleRequest(
        range.startIndex,
        range.endIndex,
        {
          bold: range.formatting.bold,
          italic: range.formatting.italic,
          strikethrough: range.formatting.strikethrough,
          fontFamily: range.formatting.code ? CODE_FONT_FAMILY : undefined,
          foregroundColor: range.formatting.code ? CODE_TEXT_HEX : undefined,
          backgroundColor: range.formatting.code ? CODE_BACKGROUND_HEX : undefined,
        },
        context.tabId
      );
      if (styleRequest) {
        context.formatRequests.push(styleRequest.request);
      }
    }

    // Apply link separately
    if (range.formatting.link) {
      const linkRequest = buildUpdateTextStyleRequest(
        range.startIndex,
        range.endIndex,
        { linkUrl: range.formatting.link },
        context.tabId
      );
      if (linkRequest) {
        context.formatRequests.push(linkRequest.request);
      }
    }
  }

  // Apply paragraph-level formatting (headings)
  for (const paraRange of context.paragraphRanges) {
    if (paraRange.namedStyleType) {
      const paraRequest = buildUpdateParagraphStyleRequest(
        paraRange.startIndex,
        paraRange.endIndex,
        { namedStyleType: paraRange.namedStyleType as any },
        context.tabId
      );
      if (paraRequest) {
        context.formatRequests.push(paraRequest.request);
      }
    }
  }

  // Apply horizontal rule styling (bottom border on empty paragraphs)
  for (const hrRange of context.hrRanges) {
    const range: docs_v1.Schema$Range = {
      startIndex: hrRange.startIndex,
      endIndex: hrRange.endIndex,
    };
    if (context.tabId) {
      range.tabId = context.tabId;
    }

    context.formatRequests.push({
      updateParagraphStyle: {
        range,
        paragraphStyle: {
          borderBottom: {
            color: {
              color: { rgbColor: { red: 0.75, green: 0.75, blue: 0.75 } },
            },
            width: { magnitude: 1, unit: 'PT' },
            padding: { magnitude: 6, unit: 'PT' },
            dashStyle: 'SOLID',
          },
        },
        fields: 'borderBottom',
      },
    });
  }

  // Apply list formatting from bottom-to-top so index shifts from tab
  // consumption do not invalidate later requests.
  const listItemsForFormatting = context.pendingListItems
    .filter(
      (listItem) => listItem.endIndex !== undefined && listItem.endIndex > listItem.startIndex
    )
    .sort((a, b) => b.startIndex - a.startIndex);

  for (const listItem of listItemsForFormatting) {
    if (listItem.endIndex !== undefined && listItem.endIndex > listItem.startIndex) {
      const rangeLocation: docs_v1.Schema$Range = {
        startIndex: listItem.startIndex,
        endIndex: listItem.endIndex,
      };
      if (context.tabId) {
        rangeLocation.tabId = context.tabId;
      }

      context.formatRequests.push({
        createParagraphBullets: {
          range: rangeLocation,
          bulletPreset: listItem.bulletPreset,
        },
      });
    }
  }
}

function getCurrentOpenListItem(context: ConversionContext): PendingListItem | null {
  const openIndex = context.openListItemStack[context.openListItemStack.length - 1];
  if (openIndex === undefined) return null;
  return context.pendingListItems[openIndex] ?? null;
}

function lastInsertEndsWithNewline(context: ConversionContext): boolean {
  const lastInsert = context.insertRequests[context.insertRequests.length - 1]?.insertText?.text;
  return Boolean(lastInsert && lastInsert.endsWith('\n'));
}

function lastInsertEndsWithDoubleNewline(context: ConversionContext): boolean {
  const lastInsert = context.insertRequests[context.insertRequests.length - 1]?.insertText?.text;
  return Boolean(lastInsert && lastInsert.endsWith('\n\n'));
}
