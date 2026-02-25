#!/usr/bin/env node
/**
 * HTTP MCP Server — Agency tier only.
 * Accepts connections from Claude Desktop with API key authentication.
 *
 * Usage: node dist/server-http.js
 * Claude Desktop config:
 *   { "url": "https://api.meta-ads.ai/mcp", "headers": { "Authorization": "Bearer sk-..." } }
 */

import express from 'express';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { TenantContext } from './tenant-context.js';
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
  ...managementTools, ...analystTools, ...creatorTools, ...debugTools,
  ...duplicatorTools, ...audienceTools, ...updaterTools, ...pixelTools,
  ...rulesTools, ...leadsTools, ...libraryTools, ...conversionsTools,
  ...catalogTools, ...testingTools, ...valueRulesTools, ...budgetScheduleTools,
  ...copyTools, ...briefTools, ...adLibraryTools, ...performanceTools,
];

// ── Dispatch map ──
type Handler = (ctx: TenantContext, name: string, args: Record<string, any>) => Promise<any>;
const dispatchMap = new Map<string, Handler>();

function register(tools: { name: string }[], handler: Handler) {
  for (const t of tools) dispatchMap.set(t.name, handler);
}
register(managementTools, handleManagementTool);
register(analystTools, handleAnalystTool);
register(creatorTools, handleCreatorTool);
register(debugTools, handleDebugTool);
register(duplicatorTools, handleDuplicatorTool);
register(audienceTools, handleAudienceTool);
register(updaterTools, handleUpdaterTool);
register(pixelTools, handlePixelTool);
register(rulesTools, handleRulesTool);
register(leadsTools, handleLeadsTool);
register(libraryTools, handleLibraryTool);
register(conversionsTools, handleConversionsTool);
register(catalogTools, handleCatalogTool);
register(testingTools, handleTestingTool);
register(valueRulesTools, handleValueRulesTool);
register(budgetScheduleTools, handleBudgetScheduleTool);
register(copyTools, handleCopyTool);
register(briefTools, handleBriefTool);
register(adLibraryTools, handleAdLibraryTool);
register(performanceTools, handlePerformanceTool);

// ── Auth callback — override this to integrate with your user database ──
// Default: reads from env vars (single-tenant dev mode).
// In production, this should validate the API key against the DB, check Agency plan,
// and return the user's TenantContext with their decrypted Meta access token.
type AuthCallback = (apiKey: string) => Promise<TenantContext | null>;

let authenticateApiKey: AuthCallback = async (_apiKey: string) => {
  // Dev mode: any API key works, uses env var credentials
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) return null;
  return {
    accessToken,
    adAccountId,
    apiVersion: process.env.META_API_VERSION ?? 'v25.0',
    dryRun: process.env.DRY_RUN === 'true',
  };
};

export function setAuthCallback(cb: AuthCallback) {
  authenticateApiKey = cb;
}

// ── Per-session state ──
const sessionContexts = new Map<string, TenantContext>();
const sessionTransports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(ctx: TenantContext): Server {
  const server = new Server(
    { name: 'meta-marketing-mcp', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = dispatchMap.get(name);

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool "${name}"` }],
        isError: true,
      };
    }

    try {
      const result = await handler(ctx, name, args ?? {});

      if (result?._mcp_image) {
        const { data, mimeType } = result._mcp_image;
        const { _mcp_image, ...rest } = result;
        return {
          content: [
            { type: 'image', data, mimeType },
            { type: 'text', text: JSON.stringify(rest) },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error: any) {
      const message = error?.response?.error?.message ?? error?.message ?? String(error);
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Express app ──
const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tools: ALL_TOOLS.length });
});

// MCP endpoint
app.all('/mcp', async (req, res) => {
  // Extract API key
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <api-key>' });
    return;
  }

  // Check for existing session
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessionTransports.has(sessionId)) {
    // Existing session — reuse transport
    const transport = sessionTransports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session or no session — authenticate
  const ctx = await authenticateApiKey(apiKey);
  if (!ctx) {
    res.status(403).json({ error: 'Invalid API key or insufficient permissions' });
    return;
  }

  // Create new session
  const newSessionId = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => newSessionId,
    onsessioninitialized: (sid) => {
      sessionContexts.set(sid, ctx);
      sessionTransports.set(sid, transport);
      console.error(`[mcp-http] Session started: ${sid}`);
    },
    onsessionclosed: (sid) => {
      sessionContexts.delete(sid);
      sessionTransports.delete(sid);
      console.error(`[mcp-http] Session closed: ${sid}`);
    },
  });

  const server = createMcpServer(ctx);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ── Start ──
const PORT = parseInt(process.env.MCP_HTTP_PORT ?? '3001', 10);

app.listen(PORT, () => {
  console.error(`[mcp-http] Listening on port ${PORT}`);
  console.error(`[mcp-http] ${ALL_TOOLS.length} tools available`);
});
