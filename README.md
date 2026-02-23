# Meta MCP Server

**MCP server for the Meta Marketing API — integrates with Claude Desktop and Claude Code.**

Ask Claude to manage your Facebook, Instagram, and Threads ad campaigns using plain language. No marketing dashboard needed.

---

## What You Can Do

- **Query** — campaign performance, insights by breakdown (age, country, placement, device), period-over-period intelligence reports, full pixel funnel breakdown (view_content → add_to_cart → initiate_checkout → purchase) on every insights response
- **Create** — full campaigns (Campaign + Ad Set + Ad) in one atomic call with automatic rollback on failure; supports special ad categories, UTM tags, custom conversion events, and destination types
- **DCO** — Dynamic Creative Optimization: give Claude 2–10 images and 2–5 headlines/bodies, Meta tests all combinations automatically
- **Duplicate** — deep-copy campaigns, ad sets, and creatives with overrides via Meta's async API
- **Automate** — create, enable/disable automated rules that pause high-CPA ad sets, scale winning budgets, or send alerts
- **Audiences** — customer list, lookalike, website pixel, Page/Instagram engagement, and video view retargeting audiences
- **Lead forms** — create native Facebook lead gen forms (with multiple-choice questions, locale, quality optimization) and retrieve lead submissions
- **Conversions API** — send server-side events with automatic SHA-256 PII hashing for iOS 14+ signal recovery
- **Catalogs** — list product catalogs, products, and product sets for Dynamic Product Ads
- **A/B Testing** — create 50/50 split tests comparing campaigns on creative, placement, targeting, or budget optimization
- **Targeting research** — search interests, behaviors, demographics, and geo locations; estimate audience size before spending
- **Pixels** — list pixels and view event statistics
- **Library** — browse the Meta Ads Library for competitive intelligence; manage ad image and video assets
- **Debug** — diagnose why an ad isn't delivering
- **Attribution** — configure attribution windows per-breakdown or per-report (1d/7d/28d click + 1d/7d view)

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
- *"Search for yoga-related interests and estimate the audience size for US women 25–44"*
- *"Show me the creative image for ad 12345"*
- *"Send a server-side Purchase event to our pixel for a $99 order"*
- *"List our product catalogs and show the first 10 products"*
- *"Create an A/B test comparing campaign A vs B on creative, running for 14 days"*
- *"Build a retargeting audience of people who watched 50%+ of our video"*

---

## Tools Overview (65 tools)

### Account & Campaign Management

| Tool | Description |
|---|---|
| `meta_get_account` | Account metadata (currency, timezone, status) |
| `meta_get_account_billing` | Spend cap, amount spent, balance, and funding source |
| `meta_get_recommendations` | Meta's optimization recommendations for the account |
| `meta_list_campaigns` | List campaigns with status and budget |
| `meta_get_campaign` | Full details for one campaign |
| `meta_list_adsets` | List ad sets, optionally by campaign |
| `meta_get_adset_details` | Full ad set details including targeting spec, budget, and bid strategy |
| `meta_list_ads` | List ads by ad set or campaign |
| `meta_get_ad_details` | Full ad details including creative spec and tracking |
| `meta_get_creative_details` | Full creative spec (object_story_spec, asset_feed_spec for DCO) |
| `meta_get_ad_preview` | Shareable preview URL + iframe for any ad format |
| `meta_list_pages` | List Facebook Pages connected to the access token |
| `meta_update_campaign_status` | Quick status change (ACTIVE/PAUSED/ARCHIVED) |
| `meta_bulk_update_status` | Update status of multiple entities in one call |

### Analytics & Insights

| Tool | Description |
|---|---|
| `meta_get_insights` | Performance metrics (CTR, CPC, ROAS, CPA) with custom date ranges |
| `meta_get_breakdown_insights` | Metrics by age, gender, country, platform, placement, device + attribution windows |
| `meta_request_insights_report` | Async deep report for 60–365 day ranges + attribution windows |
| `meta_account_intelligence` | AI-ready period-over-period summary + top/bottom campaigns |
| `meta_debug_ad` | Diagnose delivery issues (review status, learning phase, budget) |

### Targeting Research

| Tool | Description |
|---|---|
| `meta_search_targeting` | Search interest and behavior IDs (legacy combined) |
| `meta_search_interests` | Search interest targeting options with audience sizes |
| `meta_search_behaviors` | Search behavior targeting options |
| `meta_search_demographics` | Search life events, industries, income, device, OS, and more |
| `meta_search_geo_locations` | Search countries, regions, cities, and zip codes |
| `meta_get_interest_suggestions` | Expand a seed interest list with related suggestions |
| `meta_estimate_audience_size` | Estimate reach before spending — validates targeting before launch |
| `meta_predict_reach` | Model daily reach curve at a given budget |

### Campaign Creation

| Tool | Description |
|---|---|
| `meta_upload_image` | Upload image file → returns `image_hash` |
| `meta_upload_video` | Upload video file → returns `video_id` |
| `meta_deploy_campaign` | Create Campaign + Ad Set + Ad atomically; supports `special_ad_categories`, `destination_type`, `url_tags`, `custom_event_type` |
| `meta_deploy_dco_campaign` | Dynamic Creative Optimization — test multiple images × headlines × bodies |
| `meta_add_ad` | Add creative variation to an existing ad set |

### Duplication

| Tool | Description |
|---|---|
| `meta_duplicate_campaign` | Deep-copy campaign with optional URL and budget overrides |
| `meta_duplicate_adset` | Deep-copy a single ad set into the same or a different campaign |
| `meta_duplicate_creative` | Clone a creative with text/headline/CTA/URL overrides |

### Updates

| Tool | Description |
|---|---|
| `meta_update_campaign` | Update name, status, budget, bid strategy, or `special_ad_categories` |
| `meta_update_adset` | Update budget, bid, targeting, schedule, `destination_type`, or `attribution_spec` |
| `meta_update_ad` | Update name or status |

### Audiences

| Tool | Description |
|---|---|
| `meta_list_audiences` | List custom audiences |
| `meta_create_customer_audience` | Custom audience from email/phone list (SHA-256 hashed automatically) |
| `meta_create_lookalike_audience` | Lookalike from a seed audience |
| `meta_create_website_audience` | Pixel-based URL/event retargeting audience |
| `meta_create_engagement_audience` | Page/Instagram engagement retargeting (liked, commented, etc.) |
| `meta_create_video_audience` | Video view retargeting by watch percentage (25/50/75/95%) |
| `meta_delete_audience` | Permanently delete a custom audience |

### Automated Rules

| Tool | Description |
|---|---|
| `meta_list_rules` | List automated rules |
| `meta_create_rule` | Create rule (pause, scale budget, adjust bid, send alert) |
| `meta_update_rule` | Enable, disable, or rename a rule |
| `meta_delete_rule` | Delete an automated rule |

### Lead Generation

| Tool | Description |
|---|---|
| `meta_list_lead_forms` | List lead generation forms |
| `meta_create_lead_form` | Create native lead gen form with standard fields, custom questions, multiple-choice, locale, and quality optimization |
| `meta_get_leads` | Retrieve lead submissions from a form |

### Conversions API (CAPI)

| Tool | Description |
|---|---|
| `meta_send_conversions_event` | Send server-side events (Purchase, Lead, etc.) with automatic SHA-256 PII hashing for iOS 14+ signal recovery |

### Product Catalogs (DPA)

| Tool | Description |
|---|---|
| `meta_list_product_catalogs` | List product catalogs in the ad account |
| `meta_get_catalog` | Get catalog details (product count, vertical) |
| `meta_list_catalog_products` | Browse products in a catalog with search |
| `meta_list_product_sets` | List product sets (subsets) within a catalog |

### A/B Testing

| Tool | Description |
|---|---|
| `meta_list_ab_tests` | List A/B split tests (ad studies) |
| `meta_create_ab_test` | Create 50/50 split test on CREATIVE / PLACEMENT / TARGETING / BUDGET_OPTIMIZATION |

### Pixels

| Tool | Description |
|---|---|
| `meta_list_pixels` | List Meta Pixels |
| `meta_get_pixel_events` | Pixel event statistics |

### Creative Library & Ads Library

| Tool | Description |
|---|---|
| `meta_list_ad_images` | Browse uploaded ad images in the account |
| `meta_list_ad_videos` | Browse uploaded ad videos in the account |
| `meta_get_ad_image` | Fetch and display ad creative image inline in Claude |
| `meta_search_ads_library` | Search Meta Ads Library for competitor intelligence |

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
  meta-client.ts    — Meta Graph API client (SDK + fetch)
  tools/
    management.ts   — Campaign/ad set/ad read, status, preview, billing, recommendations
    analyst.ts      — Insights, breakdown, intelligence, async reports, attribution windows
    creator.ts      — Image/video upload, deploy campaign (DCO + regular)
    debug.ts        — Ad delivery diagnostics
    duplicator.ts   — Async campaign, ad set, and creative copy
    audience.ts     — Custom audiences (customer, lookalike, website, engagement, video)
    updater.ts      — Campaign/ad set/ad update tools
    pixels.ts       — Pixel list and event stats
    rules.ts        — Automated rules (list, create, update, delete)
    leads.ts        — Lead forms and lead retrieval
    library.ts      — Ad images, ad videos, Ads Library search
    conversions.ts  — Conversions API (server-side events with PII hashing)
    catalogs.ts     — Product catalogs, products, and product sets
    testing.ts      — A/B split tests (ad studies)
  utils/
    rate-limiter.ts — Score-based rate limit + exponential backoff retry
    metrics.ts      — Computed metrics (CTR, CPC, ROAS, CPA, video, conversion funnel, unique clicks)
    date-ranges.ts  — Time range resolution
    batch.ts        — Graph API batch request utility
    schemas.ts      — Shared TypeScript types
    targeting.ts    — Shared targeting spec builder
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
