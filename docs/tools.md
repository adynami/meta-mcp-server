# Tools Reference

All tools are available through Claude once the server is configured. Claude selects and calls them automatically based on your request.

> **Write operations** — Tools that create, update, or delete data always ask you to confirm details before executing. All write tools are skipped when `DRY_RUN=true`.

---

## Read / Query Tools

### `meta_get_account`

Get ad account metadata: name, currency, timezone, and account status.

**No parameters required.**

**Returns:** `{ id, name, currency, timezone, status, disable_reason }`

---

### `meta_list_campaigns`

List campaigns with name, status, objective, and budget.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 5 | Max 50 |
| `status_filter` | string[] | — | `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `after` | string | — | Pagination cursor |
| `response_format` | string | `detailed` | `concise` = name + status only |

---

### `meta_get_campaign`

Get full details for a single campaign by ID.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |

**Returns:** id, name, status, objective, effective_status, daily/lifetime budget, bid_strategy, created/start/stop times.

---

### `meta_list_adsets`

List ad sets, optionally filtered by campaign.

| Parameter | Type | Default |
|---|---|---|
| `campaign_id` | string | — |
| `limit` | number | 5 |
| `status_filter` | string[] | — |
| `response_format` | string | `detailed` |

Detailed response includes budget, bid_strategy, optimization_goal, effective_status, and targeting summary.

---

### `meta_list_ads`

List ads, optionally filtered by ad set or campaign.

| Parameter | Type | Default |
|---|---|---|
| `adset_id` | string | — |
| `campaign_id` | string | — |
| `limit` | number | 5 |

---

### `meta_get_insights`

Performance metrics with key ratios pre-calculated server-side.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | `today`, `yesterday`, `last_3d`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month` |
| `campaign_id` | string | — | Restrict to one campaign |
| `level` | string | `account` | `account`, `campaign`, `adset`, `ad` |
| `limit` | number | 5 | For non-account levels |
| `response_format` | string | `detailed` | `concise` = spend/conversions/ROAS only |

**Returns:** spend, impressions, clicks, CTR, CPC, CPM, conversions, conversion_value, ROAS, CPA, frequency, reach.

---

### `meta_get_breakdown_insights`

Performance metrics broken down by a dimension and/or time series.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | Same options as `meta_get_insights` |
| `breakdown` | string | — | `age`, `gender`, `age_gender`, `country`, `platform`, `placement`, `device` |
| `time_series` | string | — | `daily`, `weekly`, `monthly` |
| `campaign_id` | string | — | Restrict to one campaign |
| `level` | string | `account` | `account`, `campaign`, `adset`, `ad` |
| `limit` | number | 50 | Max rows |

**Example prompts:**
- *"Which country is performing best?"* → `breakdown=country`
- *"How did results trend day by day last month?"* → `time_range=last_30d, time_series=daily`
- *"Show performance by age group for campaign 123"* → `breakdown=age, campaign_id=123`

---

### `meta_request_insights_report` *(Async — step 3)*

Run a deep insights report as an async background job. Use for large date ranges (60–365 days), high-granularity breakdowns, or when exporting 100+ entities. Returns all rows when complete.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_30d` | Supports `last_60d`, `last_90d`, `this_quarter`, `last_year` in addition to standard ranges |
| `breakdown` | string | — | Same breakdown options as synchronous tool |
| `time_series` | string | — | `daily`, `weekly`, `monthly` |
| `campaign_id` | string | — | Restrict to one campaign |
| `level` | string | `account` | `account`, `campaign`, `adset`, `ad` |

**Note:** Job typically takes 1–3 minutes. Claude polls automatically and returns results when done.

---

### `meta_account_intelligence`

High-density intelligence report. Best for *"how are my ads doing?"* questions.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | Standard time ranges |
| `response_format` | string | `concise` | `concise` = summary text only · `detailed` = summary + structured trend data |

**Returns a pre-built report with:**
- Period-over-period trends (spend, CPA, ROAS, CTR vs previous period)
- Top 3 campaigns by ROAS
- Top 3 "bleeders" (spend with zero conversions)

---

### `meta_debug_ad`

Diagnose why an ad is not delivering or underperforming.

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |

**Checks:** Ad review status, learning phase, budget exhaustion, paused parent entities, performance red flags.

**Returns:** `{ ad, status, health: HEALTHY|NEEDS_ATTENTION|CRITICAL, issues[], performance_note, hierarchy }`

---

### `meta_search_targeting`

Search for interest or behavior targeting IDs.

| Parameter | Type | Required |
|---|---|---|
| `type` | string | Yes — `interest` or `behavior` |
| `query` | string | Yes |

---

### `meta_list_audiences`

List custom audiences in the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |
| `after` | string | — |

**Returns:** id, name, type, approximate size, source, delivery_status, created/updated times.

---

### `meta_list_pixels`

List Meta Pixels associated with the ad account.

---

### `meta_get_pixel_events`

Get event statistics for a specific pixel.

| Parameter | Type | Required |
|---|---|---|
| `pixel_id` | string | Yes |

---

### `meta_list_rules`

List automated rules configured in the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |

**Returns:** id, name, status, entity_type, action, schedule, evaluation_window, conditions.

---

### `meta_list_lead_forms`

List lead generation forms for the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |

**Returns:** id, name, status, leads_count, created time.

---

### `meta_get_leads`

Retrieve lead submissions from a lead generation form.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `form_id` | string | Yes | From `meta_list_lead_forms` |
| `limit` | number | No | Max 100, default 25 |
| `after` | string | No | Pagination cursor |

**Returns:** Each lead as a flat object with submitted fields (email, phone, name, etc.) and timestamp.

---

## Write Tools

---

### `meta_upload_image`

Upload a local image file to the ad account. Returns an `image_hash` for use in campaign creation tools.

| Parameter | Type | Required |
|---|---|---|
| `local_file_path` | string | Yes — absolute path |

**Validates:** Extension (jpg/png/gif/bmp/webp), size < 30 MB, non-empty.
**Warns** if aspect ratio is outside 0.5:1 – 2:1 (cropping risk).
**Returns:** `{ image_hash, warning? }`

---

### `meta_upload_video`

Upload a local video file to the ad account.

| Parameter | Type | Required |
|---|---|---|
| `local_file_path` | string | Yes — absolute path |

**Validates:** Extension (mp4/mov/avi/mkv/m4v/wmv), size < 4 GB.
**Returns:** `{ video_id }` — allow ~5 minutes before using in an ad.

---

### `meta_deploy_campaign`

Create a complete **Campaign + Ad Set + Ad** in one atomic operation. Rolls back automatically if any step fails.

#### Required Parameters

| Parameter | Type | Notes |
|---|---|---|
| `campaign_name` | string | Display name |
| `objective` | string | See objectives table below |
| `daily_budget` | number | Amount in major currency units (e.g. `50` = $50) |
| `targeting` | object | See targeting spec below |
| `page_id` | string | Facebook Page ID |
| `ad_copy` | object | `{ headline?, body, link_url, call_to_action? }` |

**Required for specific objectives:** `image_hash` (image ads), `video_id` (video ads), `cards` array (carousel), `pixel_id` (OUTCOME_SALES and OUTCOME_LEADS).

#### Campaign Objectives

| Value | Best For |
|---|---|
| `OUTCOME_SALES` | Purchase campaigns (requires `pixel_id`) |
| `OUTCOME_LEADS` | Lead gen campaigns (requires `pixel_id`) |
| `OUTCOME_TRAFFIC` | Drive website traffic |
| `OUTCOME_AWARENESS` | Brand awareness / reach |
| `OUTCOME_ENGAGEMENT` | Post engagement |
| `OUTCOME_APP_PROMOTION` | App installs |

#### Budget & Bid Options

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `budget_level` | string | `CBO` | **Ask the user if not specified.** CBO = campaign-level auto-allocation · ABO = manual per-ad-set |
| `budget_type` | string | `daily` | `daily` or `lifetime` (lifetime requires `end_time`) |
| `bid_strategy` | string | `LOWEST_COST_WITHOUT_CAP` | See bid strategies below |
| `bid_amount` | number | — | Required for BID_CAP and COST_CAP |
| `min_roas` | number | — | Required for LOWEST_COST_WITH_MIN_ROAS |

#### Bid Strategies

| Value | Best For |
|---|---|
| `LOWEST_COST_WITHOUT_CAP` | Maximize volume within budget (default) |
| `LOWEST_COST_WITH_BID_CAP` | Hard max bid per auction (`bid_amount` required) |
| `COST_CAP` | Target average cost per result (`bid_amount` required) |
| `LOWEST_COST_WITH_MIN_ROAS` | Revenue-focused with ROAS floor (`min_roas` required) |

#### Targeting Spec

```json
{
  "age_min": 18,
  "age_max": 65,
  "genders": [0],
  "geo_locations": { "countries": ["US"] },
  "interests": [{ "id": "...", "name": "Fitness" }],
  "placements": {
    "publisher_platforms": ["facebook", "instagram", "threads"],
    "threads_positions": ["feed"]
  }
}
```

Genders: `0` = All, `1` = Male, `2` = Female.

**Placements:** Omit `placements` to use Advantage+ Placements (Meta auto-selects). **Always ask the user whether they want manual placements or Advantage+ before deploying.**

**Threads:** Include `"threads"` in `publisher_platforms` and `threads_positions: ["feed"]` to run on Threads. Use 4:5 or 1:1 aspect ratio images for best results.

**Advantage+ Audience:** `use_advantage_audience: true` — **always ask the user whether to enable this before deploying.**

---

### `meta_deploy_dco_campaign` *(Dynamic Creative Optimization)*

Create a campaign where Meta automatically tests all combinations of your images, headlines, and body texts and delivers the best-performing mix.

#### Required Parameters

| Parameter | Type | Notes |
|---|---|---|
| `campaign_name` | string | Display name |
| `objective` | string | Same options as `meta_deploy_campaign` |
| `daily_budget` | number | Budget in major currency units |
| `image_hashes` | string[] | 2–10 image hashes from `meta_upload_image` |
| `headlines` | string[] | 2–5 headline variations |
| `bodies` | string[] | 2–5 body text variations |
| `link_url` | string | Destination URL |
| `page_id` | string | Facebook Page ID |
| `targeting` | object | Same structure as `meta_deploy_campaign` targeting |

**Returns:** `{ campaign_id, adset_id, ad_id, combinations, images_count, headlines_count, bodies_count, budget }`

**Note:** Meta creates all permutations (e.g. 3 images × 3 headlines × 3 bodies = 27 combinations) and optimizes delivery toward the best performers.

---

### `meta_add_ad`

Add a new ad variation to an existing ad set (for A/B creative testing).

| Parameter | Type | Required |
|---|---|---|
| `adset_id` | string | Yes |
| `ad_name` | string | Yes |
| `image_hash` | string | Yes |
| `page_id` | string | Yes |
| `headline` | string | Yes |
| `body` | string | Yes |
| `link_url` | string | Yes |
| `call_to_action` | string | No (default: LEARN_MORE) |
| `status` | string | No (default: PAUSED) |

---

### `meta_duplicate_campaign`

Deep-copy a campaign via Meta's async API. All copied entities are created PAUSED.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `campaign_id` | string | Yes | Source campaign to copy |
| `new_campaign_name` | string | Yes | Name for the new campaign |
| `funnel_urls` | string[] | No | New destination URLs per ad set |
| `daily_budget_per_adset` | number | No | New budget per ad set |

**Process:** Triggers async copy job → polls until complete (exponential backoff, up to ~20 min) → applies budget/URL changes per ad set.

---

### `meta_update_campaign`

Update an existing campaign: name, status, budget, or bid strategy.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |
| `name` | string | No |
| `status` | string | No — `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `daily_budget` | number | No |
| `lifetime_budget` | number | No |
| `bid_strategy` | string | No |

---

### `meta_update_adset`

Update an existing ad set: budget, bid, targeting, schedule, or status.

| Parameter | Type | Required |
|---|---|---|
| `adset_id` | string | Yes |
| `name` | string | No |
| `status` | string | No |
| `daily_budget` | number | No |
| `lifetime_budget` | number | No |
| `bid_strategy` | string | No |
| `bid_amount` | number | No |
| `end_time` | string | No |
| `targeting` | object | No — replaces full targeting spec |
| `ad_schedule` | array | No — dayparting schedule |

---

### `meta_update_ad`

Rename an ad or change its status. (Creative changes require a new ad — Meta creatives are immutable.)

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |
| `name` | string | No |
| `status` | string | No — `ACTIVE`, `PAUSED`, `ARCHIVED` |

---

### `meta_update_campaign_status`

Change a campaign's status to ACTIVE, PAUSED, or ARCHIVED.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |
| `status` | string | Yes |

---

## Audience Tools

### `meta_create_customer_audience`

Create a custom audience from a customer list (emails or phone numbers). Provide plaintext values — the server normalises and SHA-256 hashes them before sending.

| Parameter | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `emails` | string[] | No — normalised to lowercase and hashed |
| `phones` | string[] | No — non-digits stripped, then hashed |
| `description` | string | No |

**Note:** Minimum 100 matched users for delivery. Audience takes ~30 minutes to populate.

---

### `meta_create_lookalike_audience`

Create a Lookalike Audience — Meta finds users similar to a seed custom audience.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `source_audience_id` | string | Yes | Seed audience (1,000–5,000 users recommended) |
| `country` | string | Yes | 2-letter ISO code |
| `ratio` | number | No | 0.01–0.20 (default 0.01 = top 1%). **Ask the user if not specified.** |
| `type` | string | No | `similarity` (default) or `reach`. **Ask the user if not specified.** |

---

### `meta_create_website_audience`

Create a custom audience of website visitors based on a Meta Pixel.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `pixel_id` | string | Yes | From `meta_list_pixels` |
| `retention_days` | number | No | 1–180 (default 30). **Ask the user if not specified.** |
| `rules` | array | No | URL/event filters. Omit for all visitors. |
| `exclude_rules` | array | No | URL/event exclusion conditions. |

---

### `meta_delete_audience`

Permanently delete a custom audience. Always confirm with the user before calling.

| Parameter | Type | Required |
|---|---|---|
| `audience_id` | string | Yes |

---

## Automated Rules

### `meta_create_rule`

Create an automated rule that monitors ad performance and takes automatic actions.

Before calling, always confirm with the user:
1. Entity type (CAMPAIGN, ADSET, AD)
2. Metric to watch and threshold (e.g. `cost_per_result > 50`)
3. Action to take (PAUSE, UNPAUSE, INCREASE_DAILY_BUDGET, etc.)
4. Percentage for budget/bid changes
5. How often to evaluate (SEMI_HOURLY → WEEKLY)
6. Evaluation window (TODAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS)

**Common condition fields:** `cost_per_result`, `spend`, `impressions`, `clicks`, `ctr`, `roas`, `cpm`, `frequency`, `reach`

---

### `meta_delete_rule`

Permanently delete an automated rule. Always confirm before calling.

| Parameter | Type | Required |
|---|---|---|
| `rule_id` | string | Yes |

---

## Lead Forms

### `meta_create_lead_form`

Create a native Meta lead generation form attached to a Facebook Page.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `page_id` | string | Yes | Facebook Page ID |
| `name` | string | Yes | Internal form name |
| `privacy_policy_url` | string | Yes | Required by Meta |
| `questions` | array | No | Fields to collect (EMAIL, PHONE, FULL_NAME, etc.) |
| `context_card_title` | string | No | Intro card heading (recommended) |
| `context_card_body` | string | No | Intro card description |
| `thank_you_message` | string | No | Post-submit confirmation message |

Always ask the user which fields to collect and for the privacy policy URL before calling.

**Returns:** `{ form_id, fields_collected[] }` — use `form_id` when creating lead gen ads.

---

## Pixel Tools

### `meta_list_pixels`

List Meta Pixels associated with the ad account. Returns pixel ID, name, last fired time.

### `meta_get_pixel_events`

Get event statistics for a specific pixel.

| Parameter | Type | Required |
|---|---|---|
| `pixel_id` | string | Yes |

---

## System Setup

See [Installation](installation.md) and [Authentication](authentication.md) for initial setup.

Run `npm run setup` to get/refresh your access token.
Run `npm run setup-system-user` to check token health and get instructions for creating a non-expiring System User token.
