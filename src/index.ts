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
import { duplicatorTools, handleDuplicatorTool } from './tools/duplicator.js';
import { audienceTools, handleAudienceTool } from './tools/audience.js';
import { updaterTools, handleUpdaterTool } from './tools/updater.js';
import { pixelTools, handlePixelTool } from './tools/pixels.js';
import { rulesTools, handleRulesTool } from './tools/rules.js';
import { leadsTools, handleLeadsTool } from './tools/leads.js';
import { libraryTools, handleLibraryTool } from './tools/library.js';
import { conversionsTools, handleConversionsTool } from './tools/conversions.js';
import { catalogTools, handleCatalogTool } from './tools/catalogs.js';
import { testingTools, handleTestingTool } from './tools/testing.js';
import { valueRulesTools, handleValueRulesTool } from './tools/value-rules.js';
import { budgetScheduleTools, handleBudgetScheduleTool } from './tools/budget-schedules.js';
import { copyTools, handleCopyTool } from './tools/copy.js';
import { briefTools, handleBriefTool } from './tools/brief.js';
import { adLibraryTools, handleAdLibraryTool } from './tools/adlibrary.js';
import { performanceTools, handlePerformanceTool } from './tools/performance.js';

const ALL_TOOLS = [
  ...managementTools,
  ...analystTools,
  ...creatorTools,
  ...debugTools,
  ...duplicatorTools,
  ...audienceTools,
  ...updaterTools,
  ...pixelTools,
  ...rulesTools,
  ...leadsTools,
  ...libraryTools,
  ...conversionsTools,
  ...catalogTools,
  ...testingTools,
  ...valueRulesTools,
  ...budgetScheduleTools,
  ...copyTools,
  ...briefTools,
  ...adLibraryTools,
  ...performanceTools,
];

const managementToolNames = new Set(managementTools.map(t => t.name));
const analystToolNames = new Set(analystTools.map(t => t.name));
const creatorToolNames = new Set(creatorTools.map(t => t.name));
const debugToolNames = new Set(debugTools.map(t => t.name));
const duplicatorToolNames = new Set(duplicatorTools.map(t => t.name));
const audienceToolNames = new Set(audienceTools.map(t => t.name));
const updaterToolNames = new Set(updaterTools.map(t => t.name));
const pixelToolNames = new Set(pixelTools.map(t => t.name));
const rulesToolNames = new Set(rulesTools.map(t => t.name));
const leadsToolNames = new Set(leadsTools.map(t => t.name));
const libraryToolNames = new Set(libraryTools.map(t => t.name));
const conversionsToolNames = new Set(conversionsTools.map(t => t.name));
const catalogToolNames = new Set(catalogTools.map(t => t.name));
const testingToolNames = new Set(testingTools.map(t => t.name));
const valueRulesToolNames = new Set(valueRulesTools.map(t => t.name));
const budgetScheduleToolNames = new Set(budgetScheduleTools.map(t => t.name));
const copyToolNames = new Set(copyTools.map(t => t.name));
const briefToolNames = new Set(briefTools.map(t => t.name));
const adLibraryToolNames = new Set(adLibraryTools.map(t => t.name));
const performanceToolNames = new Set(performanceTools.map(t => t.name));

const server = new Server(
  { name: 'meta-marketing-mcp', version: '1.4.0' },
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
    } else if (duplicatorToolNames.has(name)) {
      result = await handleDuplicatorTool(name, args ?? {});
    } else if (audienceToolNames.has(name)) {
      result = await handleAudienceTool(name, args ?? {});
    } else if (updaterToolNames.has(name)) {
      result = await handleUpdaterTool(name, args ?? {});
    } else if (pixelToolNames.has(name)) {
      result = await handlePixelTool(name, args ?? {});
    } else if (rulesToolNames.has(name)) {
      result = await handleRulesTool(name, args ?? {});
    } else if (leadsToolNames.has(name)) {
      result = await handleLeadsTool(name, args ?? {});
    } else if (libraryToolNames.has(name)) {
      result = await handleLibraryTool(name, args ?? {});
    } else if (conversionsToolNames.has(name)) {
      result = await handleConversionsTool(name, args ?? {});
    } else if (catalogToolNames.has(name)) {
      result = await handleCatalogTool(name, args ?? {});
    } else if (testingToolNames.has(name)) {
      result = await handleTestingTool(name, args ?? {});
    } else if (valueRulesToolNames.has(name)) {
      result = await handleValueRulesTool(name, args ?? {});
    } else if (budgetScheduleToolNames.has(name)) {
      result = await handleBudgetScheduleTool(name, args ?? {});
    } else if (copyToolNames.has(name)) {
      result = await handleCopyTool(name, args ?? {});
    } else if (briefToolNames.has(name)) {
      result = await handleBriefTool(name, args ?? {});
    } else if (adLibraryToolNames.has(name)) {
      result = await handleAdLibraryTool(name, args ?? {});
    } else if (performanceToolNames.has(name)) {
      result = await handlePerformanceTool(name, args ?? {});
    } else {
      return {
        content: [{ type: 'text', text: `Unknown tool "${name}". Available: ${ALL_TOOLS.map(t => t.name).join(', ')}` }],
        isError: true,
      };
    }

    // Image content — return inline image + remaining fields as text
    if (result && result._mcp_image) {
      const { data, mimeType } = result._mcp_image;
      const { _mcp_image, ...rest } = result;
      return {
        content: [
          { type: 'image', data, mimeType },
          { type: 'text', text: JSON.stringify(rest) },
        ],
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
