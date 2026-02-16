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

const server = new Server(
  { name: 'meta-marketing-mcp', version: '1.1.0' },
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
        content: [{ type: 'text', text: `Unknown tool "${name}". Available: ${ALL_TOOLS.map(t => t.name).join(', ')}` }],
        isError: true,
      };
    }

    // Compact JSON — no pretty-printing to save tokens
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: extractErrorMessage(error) }],
      isError: true,
    };
  }
});

function extractErrorMessage(error: any): string {
  // Meta API errors — extract human-readable message with fix guidance
  if (error?.response?.error) {
    const e = error.response.error;
    const title = e.error_user_title ?? e.message ?? 'Unknown error';
    const detail = e.error_user_msg ? ` ${e.error_user_msg}` : '';
    const code = e.code ? ` (code ${e.code})` : '';

    // Add actionable guidance for common errors
    if (e.code === 190) return `Auth expired${code}. Run "npm run setup" in the meta-mcp-server directory to re-authenticate.`;
    if (e.code === 100) return `Invalid parameter${code}: ${title}.${detail} Check the parameter values and try again.`;
    if (e.code === 10) return `Permission denied${code}. The access token may not have the required permissions for this action.`;
    if (e.code === 17 || e.code === 4) return `Rate limited${code}. The server will auto-retry — try again in a moment.`;

    return `${title}${detail}${code}`;
  }

  if (error?.error?.message) return error.error.message;
  if (error?.message) return error.message;
  return String(error);
}

async function main(): Promise<void> {
  validateConfig();
  initApi();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.dryRun) {
    console.error('[meta-mcp] DRY_RUN mode — write operations simulated');
  }
  console.error('[meta-mcp] Server started');
}

main().catch((err) => {
  console.error('[meta-mcp] Fatal:', err);
  process.exit(1);
});
