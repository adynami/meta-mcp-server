#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig } from './config.js';
import { initApi } from './meta-client.js';
import { managementTools, handleManagementTool } from './tools/management.js';
import { analystTools, handleAnalystTool } from './tools/analyst.js';
import { creatorTools, handleCreatorTool } from './tools/creator.js';
import { debugTools, handleDebugTool } from './tools/debug.js';

// ── All tools ──

const ALL_TOOLS = [
  ...managementTools,
  ...analystTools,
  ...creatorTools,
  ...debugTools,
];

const managementToolNames = new Set(managementTools.map(t => t.name));
const analystToolNames = new Set(analystTools.map(t => t.name));
const creatorToolNames = new Set(creatorTools.map(t => t.name));
const debugToolNames = new Set(debugTools.map(t => t.name));

// ── Server ──

const server = new Server(
  { name: 'meta-marketing-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    if (managementToolNames.has(name)) {
      result = await handleManagementTool(name, args ?? {});
    } else if (analystToolNames.has(name)) {
      result = await handleAnalystTool(name, args ?? {});
    } else if (creatorToolNames.has(name)) {
      result = await handleCreatorTool(name, args ?? {});
    } else if (debugToolNames.has(name)) {
      result = await handleDebugTool(name, args ?? {});
    } else {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    const message = extractErrorMessage(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

function extractErrorMessage(error: any): string {
  // Meta API errors have a nested structure
  if (error?.response?.error) {
    const e = error.response.error;
    return `[Meta API ${e.code}] ${e.error_user_title ?? e.message ?? 'Unknown error'}${e.error_user_msg ? ': ' + e.error_user_msg : ''}`;
  }
  if (error?.error?.message) return error.error.message;
  if (error?.message) return error.message;
  return String(error);
}

// ── Bootstrap ──

async function main(): Promise<void> {
  validateConfig();
  initApi();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.dryRun) {
    console.error('[meta-mcp] Running in DRY_RUN mode — write operations are simulated');
  }
  console.error('[meta-mcp] Server started successfully');
}

main().catch((err) => {
  console.error('[meta-mcp] Fatal error:', err);
  process.exit(1);
});
