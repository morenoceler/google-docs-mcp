# Tools

This directory contains all 44 MCP tool definitions for the Google Docs, Sheets, and Drive server. Tools are organized into domain-specific folders, each with its own router (`index.ts`) that registers its tools with the server.

## Architecture

```
tools/
├── index.ts       # Top-level router — delegates to each domain
├── docs/          # Google Docs API operations
├── drive/         # Google Drive file and folder management
├── sheets/        # Google Sheets operations
└── utils/         # Cross-cutting workflow utilities
```

Each domain folder contains:
- **`index.ts`** — A router that registers all tools in the domain
- **`README.md`** — Documentation of the domain and its tools
- **Individual tool files** — One file per tool, each exporting a `register(server)` function

## Domains

| Domain | Tools | Description |
|--------|------:|-------------|
| [docs](./docs/) | 21 | Read, write, format, and comment on Google Documents |
| [drive](./drive/) | 13 | Search, create, move, copy, rename, and delete files and folders |
| [sheets](./sheets/) | 8 | Read, write, append, and manage spreadsheets |
| [utils](./utils/) | 2 | Markdown conversion and other cross-cutting workflows |

## Adding a New Tool

1. Create a new file in the appropriate domain folder (e.g., `docs/myNewTool.ts`)
2. Export a `register(server: FastMCP)` function that calls `server.addTool({...})`
3. Import and call it from the domain's `index.ts` router
