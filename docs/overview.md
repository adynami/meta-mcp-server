# Meta MCP Server

**MCP server for the Meta Marketing API — integrates with Claude Desktop and Claude Code.**

Ask Claude to manage your Facebook and Instagram ad campaigns using plain language. No marketing dashboard needed.

---

## What It Does

meta-mcp-server exposes Meta's Marketing API as a set of MCP tools that Claude can call directly. You can:

- Check campaign performance and get AI-generated insights
- Create full campaigns (Campaign + Ad Set + Ad) in one command
- Pause, activate, or archive campaigns
- Debug why an ad is not delivering
- Duplicate campaigns with new creatives
- Upload images for use in ads
- Manage custom audiences and pixels

All write operations support **DRY_RUN mode** — simulate any action without touching the API.

---

## Quick Start

1. [Install](Installation) the server
2. [Authenticate](Authentication) with your Meta account
3. [Configure](Configuration) Claude Desktop
4. Ask Claude: *"How are my ads doing this week?"*

---

## Pages

| Page | Description |
|---|---|
| [Installation](Installation) | Clone, build, and set up the server |
| [Authentication](Authentication) | OAuth flow and token management |
| [Configuration](Configuration) | Environment variables and Claude Desktop config |
| [Tools Reference](Tools-Reference) | All available MCP tools with parameters |
| [DRY RUN Mode](DRY-RUN-Mode) | Safe testing without API calls |
| [Troubleshooting](Troubleshooting) | Common errors and fixes |

---

## Architecture Overview

```
Claude Desktop / Claude Code
        │
        │  MCP (stdio)
        ▼
meta-mcp-server (Node.js / TypeScript)
        │
        │  Meta Graph API v25.0
        ▼
Facebook Marketing API
```

The server communicates with Claude over stdio using the [Model Context Protocol](https://modelcontextprotocol.io). It calls the Meta Graph API directly via `fetch` (bypassing the FB Node SDK to avoid serialization issues with nested objects).

**Tool categories:**

| Module | Tools |
|---|---|
| `management` | Account info, campaigns, ad sets, ads |
| `analyst` | Insights, intelligence reports |
| `creator` | Upload images, deploy campaigns, add ads |
| `debug` | Diagnose ad delivery issues |
| `duplicator` | Deep-copy campaigns |
| `audience` | Custom audience management |
| `updater` | Update campaign/ad set status and budgets |
| `pixels` | Pixel management and event tracking |

---

## Requirements

- Node.js 18+
- A Meta (Facebook) developer app with Marketing API access
- A Facebook ad account
- Claude Desktop or Claude Code with MCP support
