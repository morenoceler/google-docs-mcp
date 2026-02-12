// src/markdown-transformer/markdownToDocsRequests.ts
import { docs_v1 } from 'googleapis';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import {
  buildUpdateTextStyleRequest,
  buildUpdateParagraphStyleRequest,
} from '../googleDocsApiHelpers.js';
import { MarkdownConversionError } from '../types.js';

// --- Markdown-it Setup ---

function createParser(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    xhtmlOut: false,
  });
}

function getLinkHref(token: Token): string | null {
  if (token.type !== 'link_open') return null;
  const hrefAttr = token.attrs?.find((attr: [string, string]) => attr[0] === 'href');
  return hrefAttr ? hrefAttr[1] : null;
}

function getHeadingLevel(token: Token): number | null {
  if (!token.type.startsWith('heading_')) return null;
  const match = token.tag.match(/h(\d)/);
  return match ? parseInt(match[1], 10) : null;
}

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

export interface ConversionOptions {
  /** Treat the first H1 (`# ...`) as a Google Docs TITLE instead of HEADING_1. Default false. */
  firstHeadingAsTitle?: boolean;
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
  /** When firstHeadingAsTitle is on, tracks whether the title H1 has been consumed. */
  titleConsumed: boolean;
  firstHeadingAsTitle: boolean;
}

const CODE_FONT_FAMILY = 'Roboto Mono';
const CODE_TEXT_HEX = '#188038';
const CODE_BACKGROUND_HEX = '#F1F3F4';

// --- Main Conversion Function ---

/**
 * Converts a markdown string to an array of Google Docs API batch update requests.
 *
 * This is an internal function -- callers should use `insertMarkdown()` from
 * the barrel export instead.
 *
 * @param markdown - The markdown content to convert
 * @param startIndex - The document index where content should be inserted (1-based)
 * @param tabId - Optional tab ID for multi-tab documents
 * @param options - Optional conversion options (e.g. firstHeadingAsTitle)
 * @returns Array of Google Docs API requests (insertions first, then formatting)
 */
export function convertMarkdownToRequests(
  markdown: string,
  startIndex: number = 1,
  tabId?: string,
  options?: ConversionOptions,
): docs_v1.Schema$Request[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const parser = createParser();
  const tokens = parser.parse(markdown, {});

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
    titleConsumed: false,
    firstHeadingAsTitle: options?.firstHeadingAsTitle ?? false,
  };

  try {
    for (const token of tokens) {
      processToken(token, context);
    }

    finalizeFormatting(context);

    return [...context.insertRequests, ...context.formatRequests];
  } catch (error) {
    if (error instanceof MarkdownConversionError) {
      throw error;
    }
    throw new MarkdownConversionError(
      `Failed to convert markdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    case 'link_open': {
      const href = getLinkHref(token);
      if (href) {
        context.formattingStack.push({ link: href });
      }
      break;
    }
    case 'link_close':
      popFormatting(context, 'link');
      break;

    // Lists
    case 'bullet_list_open':
      context.listStack.push({ type: 'bullet', level: context.listStack.length });
      break;
    case 'bullet_list_close':
      context.listStack.pop();
      break;
    case 'ordered_list_open':
      context.listStack.push({ type: 'ordered', level: context.listStack.length });
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

    // Breaks
    case 'softbreak':
      insertText(' ', context);
      break;
    case 'hardbreak':
      insertText('\n', context);
      break;

    // Inline container
    case 'inline':
      if (token.children) {
        for (const child of token.children) {
          processToken(child, context);
        }
      }
      break;

    // Tables (structural tokens we skip through)
    case 'table_open':
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
      break;

    // Code blocks
    case 'fence':
    case 'code_block':
      handleCodeBlockToken(token, context);
      break;

    // Horizontal rules
    case 'hr':
      handleHorizontalRule(context);
      break;

    // Blockquotes (skip for now)
    case 'blockquote_open':
    case 'blockquote_close':
      break;

    default:
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
    // When firstHeadingAsTitle is enabled, the very first H1 becomes a TITLE.
    const useTitle =
      context.firstHeadingAsTitle &&
      !context.titleConsumed &&
      context.currentHeadingLevel === 1;

    if (useTitle) {
      context.titleConsumed = true;
    }

    context.paragraphRanges.push({
      startIndex: context.currentParagraphStart,
      endIndex: context.currentIndex,
      namedStyleType: useTitle ? 'TITLE' : `HEADING_${context.currentHeadingLevel}`,
    });

    insertText('\n', context);
    context.currentHeadingLevel = undefined;
    context.currentParagraphStart = undefined;
  }
}

// --- Horizontal Rule ---

function handleHorizontalRule(context: ConversionContext): void {
  if (!lastInsertEndsWithNewline(context)) {
    insertText('\n', context);
  }

  const start = context.currentIndex;
  insertText('\n', context);

  context.hrRanges.push({ startIndex: start, endIndex: context.currentIndex });
}

// --- Paragraph Handlers ---

function handleParagraphOpen(context: ConversionContext): void {
  if (context.listStack.length === 0) {
    context.currentParagraphStart = context.currentIndex;
  }
}

function handleParagraphClose(context: ConversionContext): void {
  if (!lastInsertEndsWithNewline(context)) {
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
  if (openIndex === undefined) return;

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

  insertText(text, context);

  const currentFormatting = mergeFormattingStack(context.formattingStack);
  if (hasFormatting(currentFormatting)) {
    context.textRanges.push({ startIndex, endIndex, formatting: currentFormatting });
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
    } else {
      insertText(' ', context);
    }
    context.textRanges.push({
      startIndex,
      endIndex: context.currentIndex,
      formatting: { code: true },
    });
    insertText('\n', context);
  }

  if (!lastInsertEndsWithDoubleNewline(context)) {
    insertText('\n', context);
  }
}

// --- Insert Helper ---

function insertText(text: string, context: ConversionContext): void {
  const location: Record<string, unknown> = { index: context.currentIndex };
  if (context.tabId) {
    location.tabId = context.tabId;
  }

  context.insertRequests.push({
    insertText: { location: location as docs_v1.Schema$Location, text },
  });

  context.currentIndex += text.length;
}

// --- Formatting Stack ---

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
  for (let i = context.formattingStack.length - 1; i >= 0; i--) {
    if (context.formattingStack[i][type] !== undefined) {
      context.formattingStack.splice(i, 1);
      break;
    }
  }
}

// --- Finalization ---

function finalizeFormatting(context: ConversionContext): void {
  // Character-level formatting (bold, italic, strikethrough, code, links)
  for (const range of context.textRanges) {
    const rangeLocation: docs_v1.Schema$Range = {
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    };
    if (context.tabId) {
      rangeLocation.tabId = context.tabId;
    }

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
        context.tabId,
      );
      if (styleRequest) {
        context.formatRequests.push(styleRequest.request);
      }
    }

    if (range.formatting.link) {
      const linkRequest = buildUpdateTextStyleRequest(
        range.startIndex,
        range.endIndex,
        { linkUrl: range.formatting.link },
        context.tabId,
      );
      if (linkRequest) {
        context.formatRequests.push(linkRequest.request);
      }
    }
  }

  // Paragraph-level formatting (headings)
  for (const paraRange of context.paragraphRanges) {
    if (paraRange.namedStyleType) {
      const paraRequest = buildUpdateParagraphStyleRequest(
        paraRange.startIndex,
        paraRange.endIndex,
        { namedStyleType: paraRange.namedStyleType as any },
        context.tabId,
      );
      if (paraRequest) {
        context.formatRequests.push(paraRequest.request);
      }
    }
  }

  // Horizontal rule styling (bottom border on empty paragraphs)
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

  // List formatting: merge *adjacent* items of the same bullet type into single
  // ranges so Google Docs treats them as one list (with sequential numbering).
  // Items are only merged when they're truly adjacent (gap of at most 1 char
  // for the newline between them). Separate lists with paragraphs, headings, or
  // other content between them must NOT be merged, otherwise
  // createParagraphBullets would turn all intervening content into bullets.
  const validListItems = context.pendingListItems
    .filter((item) => item.endIndex !== undefined && item.endIndex > item.startIndex)
    .sort((a, b) => a.startIndex - b.startIndex);

  const mergedListRanges: { startIndex: number; endIndex: number; bulletPreset: string }[] = [];
  for (const item of validListItems) {
    const last = mergedListRanges[mergedListRanges.length - 1];
    if (
      last &&
      last.bulletPreset === item.bulletPreset &&
      item.startIndex <= last.endIndex + 1
    ) {
      last.endIndex = Math.max(last.endIndex, item.endIndex!);
    } else {
      mergedListRanges.push({
        startIndex: item.startIndex,
        endIndex: item.endIndex!,
        bulletPreset: item.bulletPreset,
      });
    }
  }

  // Apply bottom-to-top to avoid index shifts from tab consumption
  mergedListRanges.sort((a, b) => b.startIndex - a.startIndex);

  for (const merged of mergedListRanges) {
    const rangeLocation: docs_v1.Schema$Range = {
      startIndex: merged.startIndex,
      endIndex: merged.endIndex,
    };
    if (context.tabId) {
      rangeLocation.tabId = context.tabId;
    }

    context.formatRequests.push({
      createParagraphBullets: {
        range: rangeLocation,
        bulletPreset: merged.bulletPreset,
      },
    });
  }
}

// --- Utility ---

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
