// src/markdownToGoogleDocs.ts
import { docs_v1 } from 'googleapis';
import type Token from 'markdown-it/lib/token.mjs';
import { parseMarkdown, getLinkHref, getHeadingLevel } from './markdownParser.js';
import { buildUpdateTextStyleRequest, buildUpdateParagraphStyleRequest } from './googleDocsApiHelpers.js';
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
}

interface ParagraphRange {
  startIndex: number;
  endIndex: number;
  namedStyleType?: string;
}

interface ListState {
  type: 'bullet' | 'ordered';
  level: number;
  listId?: string;
}

interface PendingListItem {
  startIndex: number;
  endIndex?: number;
  listId: string;
  nestingLevel: number;
  isOrdered: boolean;
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
  listIds: Map<string, string>; // Maps list type+level to listId
  tabId?: string;
  currentParagraphStart?: number;
  currentHeadingLevel?: number;
}

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
    listIds: new Map(),
    tabId
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
    case 'code_inline':
      handleTextToken(token, context);
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
        level: context.listStack.length
      });
      break;
    case 'bullet_list_close':
      context.listStack.pop();
      break;

    case 'ordered_list_open':
      context.listStack.push({
        type: 'ordered',
        level: context.listStack.length
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
    case 'blockquote_open':
    case 'blockquote_close':
    case 'hr':
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
      namedStyleType: headingStyleType
    });

    // Add newline after heading
    insertText('\n', context);

    context.currentHeadingLevel = undefined;
    context.currentParagraphStart = undefined;
  }
}

// --- Paragraph Handlers ---

function handleParagraphOpen(context: ConversionContext): void {
  // Skip if we're in a list - list items handle their own paragraphs
  if (context.listStack.length === 0) {
    context.currentParagraphStart = context.currentIndex;
  }
}

function handleParagraphClose(context: ConversionContext): void {
  // Skip if we're in a list
  if (context.listStack.length === 0) {
    // Add double newline after paragraph for spacing
    insertText('\n\n', context);
    context.currentParagraphStart = undefined;
  }
}

// --- List Handlers ---

function handleListItemOpen(context: ConversionContext): void {
  if (context.listStack.length === 0) {
    throw new MarkdownConversionError('List item found outside of list context');
  }

  const currentList = context.listStack[context.listStack.length - 1];
  const listKey = `${currentList.type}_${currentList.level}`;

  // Get or create list ID
  if (!context.listIds.has(listKey)) {
    // Generate a unique list ID
    const listId = `list_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    context.listIds.set(listKey, listId);
  }

  const listId = context.listIds.get(listKey)!;

  // Track the start of this list item
  const itemStart = context.currentIndex;
  context.pendingListItems.push({
    startIndex: itemStart,
    listId,
    nestingLevel: currentList.level,
    isOrdered: currentList.type === 'ordered'
  });
}

function handleListItemClose(context: ConversionContext): void {
  if (context.pendingListItems.length > 0) {
    const lastItem = context.pendingListItems[context.pendingListItems.length - 1];
    lastItem.endIndex = context.currentIndex;

    // Add newline after list item
    insertText('\n', context);
  }
}

// --- Text Handling ---

function handleTextToken(token: Token, context: ConversionContext): void {
  const text = token.content;
  if (!text) return;

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
      formatting: currentFormatting
    });
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
      text
    }
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
    if (state.link !== undefined) merged.link = state.link;
  }

  return merged;
}

function hasFormatting(formatting: FormattingState): boolean {
  return formatting.bold === true ||
         formatting.italic === true ||
         formatting.strikethrough === true ||
         formatting.link !== undefined;
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
      endIndex: range.endIndex
    };
    if (context.tabId) {
      rangeLocation.tabId = context.tabId;
    }

    // Apply text style (bold, italic, strikethrough)
    if (range.formatting.bold || range.formatting.italic || range.formatting.strikethrough) {
      const styleRequest = buildUpdateTextStyleRequest(
        range.startIndex,
        range.endIndex,
        {
          bold: range.formatting.bold,
          italic: range.formatting.italic,
          strikethrough: range.formatting.strikethrough
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

  // Apply list formatting
  for (const listItem of context.pendingListItems) {
    if (listItem.endIndex !== undefined) {
      const rangeLocation: docs_v1.Schema$Range = {
        startIndex: listItem.startIndex,
        endIndex: listItem.endIndex
      };
      if (context.tabId) {
        rangeLocation.tabId = context.tabId;
      }

      const bulletPreset = listItem.isOrdered
        ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
        : 'BULLET_DISC_CIRCLE_SQUARE';

      context.formatRequests.push({
        createParagraphBullets: {
          range: rangeLocation,
          bulletPreset,
          // Note: Google Docs API automatically manages nesting levels
          // We include nestingLevel but the API may adjust it
        }
      });
    }
  }
}
