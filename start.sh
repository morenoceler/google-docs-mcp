#!/bin/sh
set -e

# Decode credentials from env vars
if [ -n "$GOOGLE_CREDENTIALS_B64" ]; then
  echo "$GOOGLE_CREDENTIALS_B64" | base64 -d > /app/credentials.json
fi

if [ -n "$GOOGLE_TOKEN_B64" ]; then
  mkdir -p ~/.config/google-docs-mcp
  echo "$GOOGLE_TOKEN_B64" | base64 -d > ~/.config/google-docs-mcp/token.json
fi

# Start the MCP proxy wrapping the stdio server
exec mcp-proxy --port ${PORT:-8080} -- node dist/server.js
