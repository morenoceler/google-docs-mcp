// src/server.ts
import { FastMCP } from 'fastmcp';
import { initializeGoogleClient } from './clients.js';
import { registerAllTools } from './tools/index.js';

// MCP stdio transport uses stdout for protocol frames. Route accidental logs to stderr.
console.log = (...args: unknown[]) => {
  console.error(...args);
};

// Set up process-level unhandled error/rejection handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit process, just log the error and continue
  // This will catch timeout errors that might otherwise crash the server
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit process, just log the error and continue
});

const server = new FastMCP({
  name: 'Ultimate Google Docs & Sheets MCP Server',
  version: '1.0.0',
});

// Register all 44 tools from individual modules
registerAllTools(server);

// --- Server Startup ---
async function startServer() {
  try {
    await initializeGoogleClient(); // Authorize BEFORE starting listeners
    console.error('Starting Ultimate Google Docs & Sheets MCP server...');

    // Using stdio as before
    const configToUse = {
      transportType: 'stdio' as const,
    };

    // Start the server with proper error handling
    server.start(configToUse);
    console.error(
      `MCP Server running using ${configToUse.transportType}. Awaiting client connection...`
    );

    // Log that error handling has been enabled
    console.error(
      'Process-level error handling configured to prevent crashes from timeout errors.'
    );
  } catch (startError: any) {
    console.error('FATAL: Server failed to start:', startError.message || startError);
    process.exit(1);
  }
}

startServer(); // Removed .catch here, let errors propagate if startup fails critically