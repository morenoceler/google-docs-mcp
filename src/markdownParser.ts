// src/markdownParser.ts
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

export interface ParsedMarkdown {
  tokens: Token[];
  metadata: {
    estimatedLength: number;
    elementCounts: {
      headings: number;
      paragraphs: number;
      lists: number;
      tables: number;
      links: number;
    };
  };
}

/**
 * Creates and configures a markdown-it parser instance
 */
export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: false, // Security: don't allow raw HTML
    linkify: true, // Auto-convert URLs to links
    typographer: false, // Don't convert quotes/dashes
    breaks: false, // Require two spaces for line breaks
    xhtmlOut: false, // Don't use XHTML style
  });

  // markdown-it has built-in support for:
  // - Tables (GFM-style)
  // - Strikethrough (GFM-style with ~~text~~)
  // - Code blocks and inline code

  return md;
}

/**
 * Parses markdown into tokens and analyzes the structure
 */
export function parseMarkdown(markdown: string): ParsedMarkdown {
  const md = createMarkdownParser();
  const tokens = md.parse(markdown, {});

  // Analyze tokens to gather metadata
  const metadata = {
    estimatedLength: markdown.length,
    elementCounts: {
      headings: 0,
      paragraphs: 0,
      lists: 0,
      tables: 0,
      links: 0,
    },
  };

  for (const token of tokens) {
    if (token.type === 'heading_open') {
      metadata.elementCounts.headings++;
    } else if (token.type === 'paragraph_open') {
      metadata.elementCounts.paragraphs++;
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      metadata.elementCounts.lists++;
    } else if (token.type === 'table_open') {
      metadata.elementCounts.tables++;
    } else if (token.type === 'link_open') {
      metadata.elementCounts.links++;
    }
  }

  return {
    tokens,
    metadata,
  };
}

/**
 * Helper to get the href from a link_open token
 */
export function getLinkHref(token: Token): string | null {
  if (token.type !== 'link_open') return null;
  const hrefAttr = token.attrs?.find((attr: [string, string]) => attr[0] === 'href');
  return hrefAttr ? hrefAttr[1] : null;
}

/**
 * Helper to get the heading level from a heading_open token
 */
export function getHeadingLevel(token: Token): number | null {
  if (!token.type.startsWith('heading_')) return null;
  // heading_open tag looks like 'h1', 'h2', etc.
  const match = token.tag.match(/h(\d)/);
  return match ? parseInt(match[1], 10) : null;
}
