# Meta MCP Server

**MCP server for the Meta Marketing API — integrates with Claude Desktop and Claude Code.**

Ask Claude to manage your Facebook, Instagram, and Threads ad campaigns using plain language. No marketing dashboard needed.

---

## What You Can Do

- **Query** — campaign performance, insights by breakdown (age, country, placement, device), period-over-period intelligence reports
- **Create** — full campaigns (Campaign + Ad Set + Ad) in one atomic call with automatic rollback on failure
- **DCO** — Dynamic Creative Optimization: give Claude 2–10 images and 2–5 headlines/bodies, Meta tests all combinations automatically
- **Duplicate** — deep-copy campaigns with new URLs and budgets via Meta's async API
- **Automate** — create automated rules that pause high-CPA ad sets, scale winning budgets, or send alerts
- **Audiences** — customer list, lookalike, and website retargeting audiences
- **Lead forms** — create native Facebook lead gen forms and retrieve lead submissions
- **Threads** — run ads on Threads placement (globally available)
- **Pixels** — list pixels and view event statistics
- **Debug** — diagnose why an ad isn't delivering

All write operations support **DRY_RUN mode** — simulate any action without touching live data.

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/adynami/meta-mcp-server.git
cd meta-mcp-server
npm install
npm run build
```

### 2. Authenticate

```bash
npm run setup
```

This opens a browser window for Facebook login, obtains a 60-day access token, and writes it to your Claude Desktop config automatically.

For a non-expiring System User token (recommended for production):

```bash
npm run setup-system-user
```

### 3. Configure Claude Desktop

After running `npm run setup`, the config is written automatically. Restart Claude Desktop to activate the tools.

Manual config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "meta-marketing": {
      "command": "node",
      "args": ["/path/to/meta-mcp-server/dist/index.js"],
      "env": {
        "META_ACCESS_TOKEN": "your_token",
        "META_AD_ACCOUNT_ID": "act_123456789",
        "META_API_VERSION": "v25.0",
        "DRY_RUN": "false"
      }
    }
  }
}
```

### 4. Start using it

Ask Claude:

- *"How are my ads doing this week?"*
- *"Create a campaign for my fitness app with a $50/day budget targeting US males 25–45"*
- *"Pause all campaigns with a CPA over $100"*
- *"Duplicate campaign 120215... with a new landing page URL"*
- *"Create an automated rule that pauses ad sets when cost per result exceeds $50"*

---

## Tools Overview

### Read / Analytics

| Tool | Description |
|---|---|
| `meta_get_account` | Account metadata (currency, timezone, status) |
| `meta_list_campaigns` | List campaigns with status and budget |
| `meta_get_campaign` | Full details for one campaign |
| `meta_list_adsets` | List ad sets, optionally by campaign |
| `meta_list_ads` | List ads by ad set or campaign |
| `meta_get_insights` | Performance metrics with ratios (CTR, CPC, ROAS, CPA) |
| `meta_get_breakdown_insights` | Metrics by age, gender, country, platform, placement, device |
| `meta_request_insights_report` | Async deep report for 60–365 day ranges |
| `meta_account_intelligence` | AI-ready period-over-period summary + top/bottom campaigns |
| `meta_debug_ad` | Diagnose delivery issues (review status, learning phase, budget) |
| `meta_search_targeting` | Search interest and behavior IDs for targeting |
| `meta_list_audiences` | List custom audiences |
| `meta_list_pixels` | List Meta Pixels |
| `meta_get_pixel_events` | Pixel event statistics |
| `meta_list_rules` | List automated rules |
| `meta_list_lead_forms` | List lead generation forms |
| `meta_get_leads` | Retrieve lead submissions from a form |

### Write / Create

| Tool | Description |
|---|---|
| `meta_upload_image` | Upload image file → returns `image_hash` |
| `meta_upload_video` | Upload video file → returns `video_id` |
| `meta_deploy_campaign` | Create Campaign + Ad Set + Ad atomically (image/video/carousel) |
| `meta_deploy_dco_campaign` | Dynamic Creative Optimization — test multiple images × headlines × bodies |
| `meta_add_ad` | Add creative variation to an existing ad set |
| `meta_duplicate_campaign` | Deep-copy campaign with optional URL and budget overrides |
| `meta_update_campaign` | Update name, status, budget, or bid strategy |
| `meta_update_adset` | Update budget, bid, targeting, or schedule |
| `meta_update_ad` | Update name or status |
| `meta_update_campaign_status` | Quick status change (ACTIVE/PAUSED/ARCHIVED) |
| `meta_create_customer_audience` | Custom audience from email/phone list (hashed automatically) |
| `meta_create_lookalike_audience` | Lookalike from a seed audience |
| `meta_create_website_audience` | Pixel-based retargeting audience |
| `meta_delete_audience` | Permanently delete a custom audience |
| `meta_create_rule` | Create automated rule (pause, scale budget, send alert) |
| `meta_delete_rule` | Delete an automated rule |
| `meta_create_lead_form` | Create native Facebook lead gen form |

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `META_ACCESS_TOKEN` | Yes | Meta user or system user access token |
| `META_AD_ACCOUNT_ID` | Yes | Ad account ID in `act_XXXXXXXXX` format |
| `META_API_VERSION` | No | Graph API version (default: `v25.0`) |
| `META_APP_ID` | No | App ID (for token refresh) |
| `META_APP_SECRET` | No | App secret (for token refresh) |
| `DRY_RUN` | No | Set to `true` to simulate all write operations |

---

## Integration with image-gen-mcp

Pair this server with [image-gen-mcp](https://github.com/adynami/image-gen-mcp) to generate ad creatives with Google Imagen 4 and deploy them directly to Meta — all in one Claude conversation:

1. *"Generate 3 variations of a fitness ad image with a clean white background"* → `imagen_generate`
2. *"Upload the first one and create a sales campaign"* → `meta_upload_image` → `meta_deploy_campaign`
3. *"Now run DCO with all 3 images and 2 headline variants"* → `meta_deploy_dco_campaign`

---

## Project Structure

```
src/
  index.ts          — MCP server entry, tool routing
  config.ts         — Environment config
  meta-client.ts    — Meta Graph API client (fetch-based)
  tools/
    management.ts   — Campaign/ad set/ad read + status tools
    analyst.ts      — Insights, breakdown, intelligence, async reports
    creator.ts      — Image/video upload, deploy campaign, DCO
    debug.ts        — Ad delivery diagnostics
    duplicator.ts   — Async campaign copy
    audience.ts     — Custom audiences (list, customer, lookalike, website)
    updater.ts      — Campaign/ad set/ad update tools
    pixels.ts       — Pixel list and event stats
    rules.ts        — Automated rules (list, create, delete)
    leads.ts        — Lead forms and lead retrieval
  utils/
    rate-limiter.ts — Score-based rate limit + exponential backoff retry
    metrics.ts      — Computed metrics (CTR, CPC, ROAS, CPA, video)
    date-ranges.ts  — Time range resolution
    batch.ts        — Graph API batch request utility
    schemas.ts      — Shared TypeScript types
scripts/
  get-token.ts           — OAuth setup wizard (npm run setup)
  setup-system-user.ts   — System User token wizard (npm run setup-system-user)
docs/                   — Full documentation
```

---

## Docs

Full documentation is in the [`docs/`](docs/) folder:

- [Overview](docs/overview.md)
- [Installation](docs/installation.md)
- [Authentication](docs/authentication.md)
- [Configuration](docs/configuration.md)
- [Tools Reference](docs/tools.md)
- [DRY RUN Mode](docs/dry-run.md)
- [Troubleshooting](docs/troubleshooting.md)
