# Docs

Tools for interacting with the Google Docs API. Covers reading and writing document content, text and paragraph formatting, structural elements like tables and images, and comment management.

## Structure

```
docs/
├── index.ts            # Router — registers top-level tools and delegates to sub-domains
├── comments/           # Comment management sub-domain
│   └── index.ts        # Router for comment tools
├── formatting/         # Text and paragraph formatting sub-domain
│   └── index.ts        # Router for formatting tools
└── (top-level tools)   # Core read/write and structure tools
```

## Core Read/Write

| Tool | Description |
|------|-------------|
| `readGoogleDoc` | Reads the content of a Google Document, optionally returning structured data |
| `listDocumentTabs` | Lists all tabs in a Google Document, including hierarchy, IDs, and structure |
| `appendToGoogleDoc` | Appends text to the end of a Google Document or tab |
| `insertText` | Inserts text at a specific index within the document body or a specific tab |
| `deleteRange` | Deletes content within a specified range from the document or a specific tab |

## Structure

| Tool | Description |
|------|-------------|
| `insertTable` | Inserts a new table with specified dimensions at a given index |
| `editTableCell` | Edits the content and/or style of a specific table cell (not yet implemented) |
| `insertPageBreak` | Inserts a page break at the specified index |
| `insertImageFromUrl` | Inserts an inline image from a publicly accessible URL |
| `insertLocalImage` | Uploads a local image to Drive and inserts it into the document |
| `fixListFormatting` | Experimental: detects and converts text that looks like lists into proper formatted lists |
| `findElement` | Finds elements based on various criteria (not yet implemented) |

## [Formatting](./formatting/)

| Tool | Description |
|------|-------------|
| `applyTextStyle` | Applies character-level formatting (bold, color, font, etc.) to a range or found text |
| `applyParagraphStyle` | Applies paragraph-level formatting (alignment, spacing, named styles) |
| `formatMatchingText` | Finds specific text and applies character formatting to the matched instance |

## [Comments](./comments/)

| Tool | Description |
|------|-------------|
| `listComments` | Lists all comments in a Google Document |
| `getComment` | Gets a specific comment with its full thread of replies |
| `addComment` | Adds a comment anchored to a specific text range |
| `replyToComment` | Adds a reply to an existing comment |
| `resolveComment` | Marks a comment as resolved |
| `deleteComment` | Deletes a comment from the document |
