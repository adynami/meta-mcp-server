# Tools Reference

All tools are available through Claude once the server is configured. Claude selects and calls them automatically based on your request.

---

## Read / Query Tools

### `meta_get_account`

Get ad account metadata: name, currency, timezone, and account status.

**No parameters required.**

**Returns:** `{ id, name, currency, timezone, status, disable_reason }`

**Example prompt:** *"What's my ad account name and currency?"*

---

### `meta_list_campaigns`

List campaigns with name, status, objective, and budget.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 5 | Max 50 |
| `status_filter` | string[] | — | `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `after` | string | — | Pagination cursor |
| `response_format` | string | `detailed` | `concise` = name + status only |

**Example prompt:** *"List my active campaigns."*

---

### `meta_get_campaign`

Get full details for a single campaign by ID.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |

**Returns:** id, name, status, objective, daily/lifetime budget, bid_strategy, created/start/stop times.

---

### `meta_list_adsets`

List ad sets, optionally filtered by campaign.

| Parameter | Type | Default |
|---|---|---|
| `campaign_id` | string | — |
| `limit` | number | 5 |
| `status_filter` | string[] | — |
| `response_format` | string | `detailed` |

Detailed response includes budget, bid_strategy, optimization_goal, and targeting summary (age/geo/gender).

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

**Example prompt:** *"How much did I spend last month and what was my ROAS?"*

---

### `meta_account_intelligence`

High-density intelligence report. Best for *"how are my ads doing?"* questions.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | `last_3d`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month` |
| `response_format` | string | `concise` | `concise` = summary text only (~200 tokens) · `detailed` = summary + structured trend data |

**Returns a pre-built report with:**
- Period-over-period trends (spend, CPA, ROAS, CTR vs previous period)
- Top 3 campaigns by ROAS
- Top 3 "bleeders" (spend with zero conversions)

**Example prompt:** *"Give me an intelligence report on my ads this month."*

---

### `meta_debug_ad`

Diagnose why an ad is not delivering or underperforming. Checks the full hierarchy (ad → ad set → campaign).

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |

**Checks:**
- Ad review status (DISAPPROVED / PENDING_REVIEW / WITH_ISSUES) with human-readable rejection reasons
- Learning phase status (LEARNING / LEARNING_LIMITED)
- Budget exhaustion at ad set and campaign level
- Paused parent entities blocking delivery
- Recent performance red flags (zero impressions in 3 days, zero clicks at >1000 impressions, CTR < 0.5%)

**Returns:** `{ ad, status, health: HEALTHY|NEEDS_ATTENTION|CRITICAL, issues[], performance_note, hierarchy }`

**Example prompt:** *"Why isn't ad 120215... delivering?"*

---

## Write Tools

> All write tools are no-ops when `DRY_RUN=true`. See [DRY RUN Mode](DRY-RUN-Mode).

---

### `meta_upload_image`

Upload a local image file to the ad account. Returns an `image_hash` for use in `meta_deploy_campaign` and `meta_add_ad`.

| Parameter | Type | Required |
|---|---|---|
| `local_file_path` | string | Yes — absolute path |

**Validates:**
- File exists and is readable
- Extension is `jpg`, `jpeg`, `png`, `gif`, `bmp`, or `webp`
- Size < 30 MB
- File is not empty

**Warns** if aspect ratio is outside 0.5:1 – 2:1 (cropping risk).

Recommended aspect ratios: **1:1** (square) or **1.91:1** (landscape).

**Returns:** `{ image_hash, warning? }`

---

### `meta_deploy_campaign`

Create a complete **Campaign + Ad Set + Ad** in one atomic operation. Rolls back automatically if any step fails — no zombie campaigns.

#### Required Parameters

| Parameter | Type | Notes |
|---|---|---|
| `campaign_name` | string | Display name |
| `objective` | string | See objectives table |
| `daily_budget` | number | Amount in major currency units (e.g. `50` = $50) |
| `targeting` | object | See targeting spec |
| `image_hash` | string | From `meta_upload_image` |
| `page_id` | string | Facebook Page ID |
| `ad_copy` | object | `{ headline, body, link_url, call_to_action? }` |

#### Campaign Objectives

| Value | Optimization Goal | Use For |
|---|---|---|
| `OUTCOME_SALES` | OFFSITE_CONVERSIONS | Purchase campaigns (requires pixel) |
| `OUTCOME_LEADS` | LEAD_GENERATION | Lead gen (requires pixel) |
| `OUTCOME_TRAFFIC` | LINK_CLICKS | Drive website traffic |
| `OUTCOME_AWARENESS` | REACH | Brand awareness |
| `OUTCOME_ENGAGEMENT` | POST_ENGAGEMENT | Page engagement |
| `OUTCOME_APP_PROMOTION` | APP_INSTALLS | App installs |

#### Budget & Bid Options

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `budget_level` | string | `CBO` | `CBO` = Advantage Campaign Budget · `ABO` = Ad Set Budget |
| `budget_type` | string | `daily` | `daily` or `lifetime` |
| `end_time` | string | — | Required when `budget_type=lifetime`. ISO 8601 |
| `bid_strategy` | string | `LOWEST_COST_WITHOUT_CAP` | See bid strategy table |
| `bid_amount` | number | — | Required for `LOWEST_COST_WITH_BID_CAP` and `COST_CAP` |
| `min_roas` | number | — | Required for `LOWEST_COST_WITH_MIN_ROAS` |

#### Bid Strategies

| Value | Requires | Best For |
|---|---|---|
| `LOWEST_COST_WITHOUT_CAP` | nothing | Maximize volume within budget. Best for scaling. |
| `LOWEST_COST_WITH_BID_CAP` | `bid_amount` | Hard max bid per auction. Strict CPA control, may limit volume. |
| `COST_CAP` | `bid_amount` | Target average cost per result. |
| `LOWEST_COST_WITH_MIN_ROAS` | `min_roas` | Revenue-focused. Only enters auctions meeting ROAS floor. |

#### Targeting Spec

```json
{
  "age_min": 18,
  "age_max": 65,
  "genders": [0],
  "geo_locations": {
    "countries": ["US"]
  }
}
```

Genders: `0` = All, `1` = Male, `2` = Female.

#### Additional Options

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `pixel_id` | string | *(configured)* | Required for `OUTCOME_SALES` and `OUTCOME_LEADS` |
| `use_advantage_audience` | boolean | `false` | Enables Meta Advantage+ targeting |
| `start_immediately` | boolean | `true` | `false` = create in PAUSED status |

#### Call-to-Action Options

`LEARN_MORE` · `SHOP_NOW` · `SIGN_UP` · `BOOK_TRAVEL` · `CONTACT_US` · `DOWNLOAD` · `GET_OFFER` · `GET_QUOTE` · `SUBSCRIBE` · `APPLY_NOW`

**Returns on success:** `{ success, campaign_id, adset_id, ad_id, status, budget_level, budget, bid_strategy }`

**Returns on failure:** `{ success: false, error, failed_at, rolled_back, error_raw }`

---

### `meta_add_ad`

Add a new ad variation to an existing ad set. Use for A/B testing creatives within one ad set. For full campaign creation, use `meta_deploy_campaign`.

| Parameter | Type | Required |
|---|---|---|
| `adset_id` | string | Yes |
| `ad_name` | string | Yes |
| `image_hash` | string | Yes — from `meta_upload_image` |
| `page_id` | string | Yes |
| `headline` | string | Yes |
| `body` | string | Yes |
| `link_url` | string | Yes |
| `call_to_action` | string | No (default: `LEARN_MORE`) |
| `status` | string | No (default: `PAUSED`) |

---

### `meta_update_campaign_status`

Change a campaign to ACTIVE, PAUSED, or ARCHIVED.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |
| `status` | string | Yes — `ACTIVE`, `PAUSED`, `ARCHIVED` |

**Example prompt:** *"Pause campaign 120215..."*

---

### `meta_duplicate_campaign`

Deep-copy a campaign via Meta's async batch API. All copied entities are created PAUSED. Allows swapping the funnel URL per ad set.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `campaign_id` | string | Yes | Source campaign to copy |
| `new_name` | string | Yes | Name for the new campaign |
| `funnel_urls` | string[] | Yes | Exactly 3 URLs — one per ad set |
| `daily_budget_per_adset` | number | Yes | Budget per ad set in major currency units |

**Process:**
1. Triggers Meta's async copy job
2. Polls until complete (3-second intervals, up to ~5 minutes)
3. Applies per-adset budget to the new campaign
4. Creates new ad creatives with swapped funnel URLs

**Returns:** `{ new_campaign_id, status: 'PAUSED', message }`

---

## Updater Tools

### `meta_update_adset`

Update ad set budget, bid amount, or status.

### `meta_bulk_update_status`

Update the status of multiple campaigns, ad sets, or ads at once.

---

## Audience Tools

### `meta_list_audiences`

List custom audiences in the ad account.

### `meta_create_audience`

Create a new custom audience.

### `meta_get_audience`

Get details for a specific custom audience.

---

## Pixel Tools

### `meta_list_pixels`

List Meta pixels associated with the ad account.

### `meta_get_pixel`

Get details and event statistics for a specific pixel.
