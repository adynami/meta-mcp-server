# Meta MCP Server — Tool Reference

Meta Marketing API v25.0 via MCP. All write operations respect `DRY_RUN` mode (simulated responses, no API calls).

**72 tools** across 16 categories.

---

## Table of Contents

- [Account & Billing](#account--billing)
- [Campaigns & Ad Sets](#campaigns--ad-sets)
- [Analytics & Insights](#analytics--insights)
- [Targeting Research](#targeting-research)
- [Campaign Creation](#campaign-creation)
- [Duplication](#duplication)
- [Updates](#updates)
- [Custom Audiences](#custom-audiences)
- [Automated Rules](#automated-rules)
- [Lead Generation](#lead-generation)
- [Conversions API](#conversions-api-capi)
- [Product Catalogs (DPA)](#product-catalogs-dpa)
- [A/B Testing](#ab-testing)
- [Pixels](#pixels)
- [Creative Library & Ads Library](#creative-library--ads-library)
- [Debug](#debug)
- [Value Rules (Advanced Bidding)](#value-rules-advanced-bidding)
- [High Demand Periods (Advanced Budget Scheduling)](#high-demand-periods-advanced-budget-scheduling)
- [Architecture Notes](#architecture-notes)

---

## Account & Billing

### `meta_get_account`
Get ad account metadata: name, currency, timezone, and account status.

**No parameters required.**

Returns: `{ id, name, currency, timezone, status, disable_reason }`

---

### `meta_get_account_billing`
Get billing and spend information for the ad account.

**No parameters required.**

Returns: `{ currency, amount_spent, spend_cap, remaining, balance, funding_source }`

---

### `meta_get_recommendations`
Get Meta's automated optimization recommendations (e.g. enable Advantage+ audience, fix rejected ads, increase budget on winners).

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 10 |

Returns: `{ recommendations: [{ title, message, importance, confidence, blame_field }], total }`

---

## Campaigns & Ad Sets

### `meta_list_campaigns`
List campaigns with name, status, objective, and budget.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 5 | Max 50 |
| `status_filter` | string[] | — | `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `after` | string | — | Pagination cursor |
| `response_format` | string | `detailed` | `concise` = name+status only |

---

### `meta_get_campaign`
Get full details for a single campaign by ID.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |

Returns: id, name, status, objective, daily/lifetime budget, bid_strategy, created/start/stop times.

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

| Parameter | Type |
|---|---|
| `adset_id` | string |
| `campaign_id` | string |
| `limit` | number (default 5) |

---

### `meta_get_ad_details`
Full details for a single ad including creative spec, bid, and parent IDs.

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |

---

### `meta_get_adset_details`
Full details for a single ad set: targeting spec, budget, bid strategy, optimization goal, schedule, and promoted object.

| Parameter | Type | Required |
|---|---|---|
| `adset_id` | string | Yes |

---

### `meta_get_creative_details`
Full creative spec (object_story_spec, asset_feed_spec for DCO) for an ad creative.

| Parameter | Type | Required |
|---|---|---|
| `creative_id` | string | Yes |

---

### `meta_get_ad_preview`
Generate a shareable preview URL and iframe snippet for an ad in any format.

| Parameter | Type | Default |
|---|---|---|
| `ad_id` | string | Required |
| `ad_format` | string | `DESKTOP_FEED_STANDARD` |

Formats: `DESKTOP_FEED_STANDARD` · `MOBILE_FEED_STANDARD` · `INSTAGRAM_STANDARD` · `INSTAGRAM_STORY` · `FACEBOOK_STORY_MOBILE` · `MARKETPLACE_MOBILE` · `MESSENGER_MOBILE_INBOX_MEDIA`

Returns: `{ ad_id, format, iframe_snippet, shareable_link }`

---

### `meta_list_pages`
List Facebook Pages connected to the access token.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |

---

### `meta_predict_reach`
Model the daily reach curve at a given budget before spending. Returns lower/upper bound reach and MAU.

| Parameter | Type | Required |
|---|---|---|
| `targeting` | object | Yes |
| `daily_budget_usd` | number | No |
| `optimization_goal` | string | No |

---

### `meta_update_campaign_status`
Change a campaign to ACTIVE, PAUSED, or ARCHIVED.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |
| `status` | string | Yes — `ACTIVE`, `PAUSED`, `ARCHIVED` |

---

### `meta_bulk_update_status`
Update the status of multiple campaigns, ad sets, or ads in one call.

| Parameter | Type | Required |
|---|---|---|
| `ids` | string[] | Yes (1–50 IDs) |
| `status` | string | Yes — `ACTIVE`, `PAUSED`, `ARCHIVED` |

---

## Analytics & Insights

### `meta_get_insights`
Performance metrics with all key ratios pre-calculated server-side.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | `today`, `yesterday`, `last_3d`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month`, `custom` |
| `since` | string | — | `YYYY-MM-DD` — required when `time_range=custom` |
| `until` | string | — | `YYYY-MM-DD` — required when `time_range=custom` |
| `campaign_id` | string | — | Restrict to one campaign |
| `level` | string | `account` | `account`, `campaign`, `adset`, `ad` |
| `limit` | number | 5 | For non-account levels |
| `response_format` | string | `detailed` | `concise` = spend/conversions/roas only |

Returns: spend, impressions, clicks, CTR, CPC, CPM, conversions, conversion_value, ROAS, CPA, frequency, reach.

---

### `meta_account_intelligence`
High-density intelligence report. Use for "how are my ads doing?" style questions.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | `last_3d`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month` |
| `response_format` | string | `concise` | `concise` = summary text only (~200 tokens), `detailed` = summary + structured trend data |

Returns a pre-built text summary with:
- Period-over-period trends (spend, CPA, ROAS, CTR vs previous period)
- Top 3 campaigns by ROAS
- Top 3 "bleeders" (spend with zero conversions)

---

### `meta_get_breakdown_insights`
Metrics broken down by a dimension (age, gender, country, platform, placement, device) and/or a time series (daily, weekly, monthly).

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_7d` | |
| `breakdown` | string | — | `age`, `gender`, `age_gender`, `country`, `platform`, `placement`, `device` |
| `time_series` | string | — | `daily`, `weekly`, `monthly` — can combine with breakdown |
| `campaign_id` | string | — | Restrict to one campaign |
| `level` | string | `account` | `account`, `campaign`, `adset`, `ad` |
| `limit` | number | 50 | Max 200 |
| `attribution_window` | string | — | `1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view`, `7d_click_1d_view` |

---

### `meta_request_insights_report`
Asynchronous deep report for large date ranges (60–365 days), high-granularity breakdowns, or many rows. Polls until complete.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `time_range` | string | `last_30d` | Also supports `last_60d`, `last_90d`, `this_quarter`, `last_year` |
| `breakdown` | string | — | Same options as `meta_get_breakdown_insights` |
| `time_series` | string | — | `daily`, `weekly`, `monthly` |
| `campaign_id` | string | — | |
| `level` | string | `account` | |
| `attribution_window` | string | — | |

Use when: date ranges > 30 days, placement × device × country breakdowns, 100+ campaigns.

---

## Debug

### `meta_debug_ad`
Diagnose why an ad is not delivering or underperforming. Checks the full hierarchy (ad → ad set → campaign).

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |

Checks:
- Ad review status (DISAPPROVED/PENDING_REVIEW/WITH_ISSUES) with human-readable rejection reasons
- Learning phase status (LEARNING / LEARNING_LIMITED)
- Budget exhaustion at ad set and campaign level
- Paused parent entities blocking delivery
- Recent performance red flags (zero impressions in 3 days, zero clicks at >1000 impressions, CTR < 0.5%)

Returns: `{ ad, status, health: HEALTHY|NEEDS_ATTENTION|CRITICAL, issues[], performance_note, hierarchy }`

---

## Targeting Research

### `meta_search_targeting`
Search for interest or behavior targeting options by keyword (legacy combined endpoint).

| Parameter | Type | Required |
|---|---|---|
| `type` | string | Yes — `interest` or `behavior` |
| `query` | string | Yes |

---

### `meta_search_interests`
Search Facebook interest targeting options with audience size estimates.

| Parameter | Type | Default |
|---|---|---|
| `query` | string | Required |
| `limit` | number | 25 |

Returns: `[{ id, name, audience_size_lower_bound, audience_size_upper_bound, path }]`

---

### `meta_search_behaviors`
Search behavior targeting options (purchase patterns, device usage, travel habits).

| Parameter | Type | Default |
|---|---|---|
| `query` | string | Required |
| `limit` | number | 25 |

---

### `meta_search_demographics`
Search demographic targeting options: life events, industries, income, device/OS, generation, parental status, and more.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `class` | string | Yes | `life_events`, `industries`, `income`, `user_device`, `user_os`, `generation`, `household_composition`, `parents`, `politics`, `relationship_statuses`, `work_employers`, `work_positions` |
| `query` | string | No | Filter keyword within the class |
| `limit` | number | No | Default: 25 |

---

### `meta_search_geo_locations`
Search geographic targeting options (countries, regions, cities, zip codes).

| Parameter | Type | Default |
|---|---|---|
| `query` | string | Required |
| `location_types` | string[] | all types |
| `limit` | number | 25 |

`location_types` options: `country`, `region`, `city`, `zip`, `geo_market`, `electoral_district`, `country_group`, `place`

---

### `meta_get_interest_suggestions`
Given seed interest IDs, return related/similar interest suggestions.

| Parameter | Type | Required |
|---|---|---|
| `interest_ids` | string[] | Yes |
| `limit` | number | No (default: 25) |

---

### `meta_estimate_audience_size`
Estimate the potential reach of a targeting configuration before spending.

| Parameter | Type | Required |
|---|---|---|
| `targeting` | object | Yes — same shape as `meta_deploy_campaign` targeting |

Returns: `{ lower_bound, upper_bound, mau_lower_bound, mau_upper_bound }`

---

## Campaign Creation

> All write tools are no-ops when `DRY_RUN=true`.

### `meta_upload_image`
Upload a local image file to the ad account. Returns an `image_hash` for use in `meta_deploy_campaign` and `meta_add_ad`.

| Parameter | Type | Required |
|---|---|---|
| `local_file_path` | string | Yes — absolute path |

Validates: file exists, extension is jpg/jpeg/png/gif/bmp/webp, size < 30MB, not empty.
Warns if aspect ratio is outside 0.5:1–2:1 (cropping risk). Recommended: 1:1 or 1.91:1.

Returns: `{ image_hash, warning? }`

---

### `meta_upload_video`
Upload a local video file to the ad account. Returns a `video_id` for use in video ads. Meta processes the video asynchronously after upload — allow ~5 minutes before using it in an ad.

| Parameter | Type | Required |
|---|---|---|
| `local_file_path` | string | Yes — absolute path |

Validates: file exists, extension is mp4/mov/avi/mkv/m4v/wmv, size < 4GB. Keep under 1GB for best results.

Returns: `{ video_id }`

---

### `meta_deploy_campaign`
Create a complete Campaign + Ad Set + Ad in one atomic operation. Rolls back automatically if any step fails (no zombie campaigns).

#### Required Parameters

| Parameter | Type | Notes |
|---|---|---|
| `campaign_name` | string | Display name |
| `objective` | string | See objectives table below |
| `daily_budget` | number | Amount in major currency units (e.g. `50` = $50) |
| `targeting` | object | See targeting spec below |
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
| `budget_level` | string | `CBO` | `CBO` = Advantage Campaign Budget (Meta auto-allocates across ad sets) · `ABO` = Ad Set Budget (manual per-adset control) |
| `budget_type` | string | `daily` | `daily` = spend per day · `lifetime` = total spend over campaign duration |
| `end_time` | string | — | **Required** when `budget_type=lifetime`. ISO 8601 (e.g. `2025-12-31T23:59:59Z`) |
| `bid_strategy` | string | `LOWEST_COST_WITHOUT_CAP` | See bid strategy table below |
| `bid_amount` | number | — | **Required** for `LOWEST_COST_WITH_BID_CAP` and `COST_CAP`. Major currency units (e.g. `15` = $15) |
| `min_roas` | number | — | **Required** for `LOWEST_COST_WITH_MIN_ROAS`. Multiplier (e.g. `2.5` = $2.50 revenue per $1 spent) |

#### Bid Strategies

| Value | Requires | Best For |
|---|---|---|
| `LOWEST_COST_WITHOUT_CAP` | nothing | Maximise volume within budget. Best for scaling. |
| `LOWEST_COST_WITH_BID_CAP` | `bid_amount` | Hard max bid per auction. Strict CPA control, may limit volume. |
| `COST_CAP` | `bid_amount` | Target average cost per result. Flexible but hits the target on average. |
| `LOWEST_COST_WITH_MIN_ROAS` | `min_roas` | Revenue-focused. Only enters auctions expected to meet ROAS floor. |

> **CBO mode**: budget + bid_strategy on campaign; ad set gets `is_adset_budget_sharing_enabled: true`.
> **ABO mode**: budget + bid_strategy on ad set; campaign has no budget.
> `bid_amount` is always on the ad set (converted to cents internally).
> `min_roas` converted to basis points (`× 10000`) as `bid_constraints.roas_average_floor`.

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
| `pixel_id` | string | env default | Required for `OUTCOME_SALES` and `OUTCOME_LEADS`. |
| `use_advantage_audience` | boolean | `false` | Enables Meta Advantage+ automated targeting. When true, manual targeting spec is used as a signal only. |
| `start_immediately` | boolean | `true` | `false` = create in PAUSED status |
| `special_ad_categories` | string[] | `[]` | Required for regulated ads: `CREDIT`, `EMPLOYMENT`, `HOUSING`, `ISSUES_ELECTIONS_POLITICS` |
| `destination_type` | string | `WEBSITE` | `WEBSITE`, `MESSENGER`, `WHATSAPP`, `INSTAGRAM_DIRECT`, `APP`, `ON_AD` |
| `url_tags` | string | — | UTM parameters appended to link (e.g. `utm_source=facebook&utm_campaign=summer`) |
| `custom_event_type` | string | — | Override conversion event: `PURCHASE`, `LEAD`, `COMPLETE_REGISTRATION`, `ADD_TO_CART`, etc. |

#### Call-to-Action Options
`LEARN_MORE` · `SHOP_NOW` · `SIGN_UP` · `BOOK_TRAVEL` · `CONTACT_US` · `DOWNLOAD` · `GET_OFFER` · `GET_QUOTE` · `SUBSCRIBE` · `APPLY_NOW`

Returns on success: `{ success, campaign_id, adset_id, ad_id, status, budget_level, budget, bid_strategy }`
Returns on failure: `{ success: false, error, failed_at, rolled_back, error_raw }`

---

### `meta_add_ad`
Add a new ad variation to an existing ad set. Use for creative A/B testing within one ad set.

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

### `meta_deploy_dco_campaign`
Create a Dynamic Creative Optimization campaign. Meta automatically tests all combinations of your images × headlines × bodies and delivers the best mix to each user.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `campaign_name` | string | Yes | |
| `objective` | string | Yes | Same options as `meta_deploy_campaign` |
| `daily_budget` | number | Yes | Major currency units |
| `image_hashes` | string[] | Yes | 2–10 image hashes from `meta_upload_image` |
| `headlines` | string[] | Yes | 2–5 headline variations |
| `bodies` | string[] | Yes | 2–5 body text variations |
| `link_url` | string | Yes | Destination URL |
| `page_id` | string | Yes | Facebook Page ID |
| `targeting` | object | Yes | Same shape as `meta_deploy_campaign` targeting |
| `call_to_action` | string | No | Default: `LEARN_MORE` |
| `pixel_id` | string | No | Required for OUTCOME_SALES / OUTCOME_LEADS |
| `start_immediately` | boolean | No | Default: `true` |

---

## Duplication

### `meta_duplicate_campaign`
Deep-copy a campaign (all ad sets and ads) via Meta's async API. All copied entities are created PAUSED.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `campaign_id` | string | Yes | Source campaign to copy |
| `new_campaign_name` | string | Yes | Name for the new campaign |
| `funnel_urls` | string[] | No | New destination URLs per ad set (by index). Omit to keep originals. |
| `daily_budget_per_adset` | number | No | New daily budget per ad set. Omit to keep originals. |

Process: triggers async copy job → polls until complete → applies URL/budget overrides.

Returns: `{ new_campaign_id, status: 'PAUSED', message }`

---

### `meta_duplicate_adset`
Deep-copy a single ad set (with its ads) into the same or a different campaign.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `adset_id` | string | Yes | Source ad set |
| `target_campaign_id` | string | No | Destination campaign (default: same campaign) |
| `new_name` | string | No | Default: original name + " Copy" |
| `deep_copy` | boolean | No | Copy ads inside the ad set (default: `true`) |
| `status` | string | No | `PAUSED` (default), `ACTIVE`, `INHERITED_FROM_SOURCE` |

---

### `meta_duplicate_creative`
Clone an ad creative and optionally override copy, headline, CTA, or URL.

| Parameter | Type | Required |
|---|---|---|
| `creative_id` | string | Yes |
| `new_name` | string | No |
| `body_override` | string | No — replace primary text |
| `headline_override` | string | No — replace headline |
| `cta_type_override` | string | No — replace CTA button |
| `url_override` | string | No — replace destination URL |

Returns: `{ new_creative_id }`

---

## Updates

### `meta_update_campaign`
Update an existing campaign. Only provide fields you want to change.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |
| `name` | string | No |
| `status` | string | No — `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `daily_budget` | number | No — major currency units |
| `lifetime_budget` | number | No — cannot switch type |
| `bid_strategy` | string | No |
| `special_ad_categories` | string[] | No — pass `[]` to clear |

---

### `meta_update_adset`
Update an existing ad set. Targeting replacement is full — provide the complete object.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `adset_id` | string | Yes | |
| `name` | string | No | |
| `status` | string | No | |
| `daily_budget` | number | No | |
| `lifetime_budget` | number | No | |
| `bid_strategy` | string | No | |
| `bid_amount` | number | No | Required for BID_CAP / COST_CAP strategies |
| `end_time` | string | No | ISO 8601 |
| `targeting` | object | No | Full replacement — age, geo, genders, interests, behaviors, placements, custom_audiences |
| `ad_schedule` | array | No | Dayparting — requires lifetime budget. Each: `{ days, start_minute, end_minute }` |
| `destination_type` | string | No | `WEBSITE`, `MESSENGER`, `WHATSAPP`, `INSTAGRAM_DIRECT`, `PHONE_CALL`, `APP`, `ON_AD` |
| `attribution_spec` | array | No | `[{ event_type: "CLICK_THROUGH", window_days: 7 }, ...]` |

---

### `meta_update_ad`
Update an existing ad's name or status. Creative changes require a new ad (Meta creatives are immutable).

| Parameter | Type | Required |
|---|---|---|
| `ad_id` | string | Yes |
| `name` | string | No |
| `status` | string | No — `ACTIVE`, `PAUSED`, `ARCHIVED` |

---

## Custom Audiences

### `meta_list_audiences`
List custom audiences with type, approximate size, and delivery status.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 (max 50) |
| `after` | string | — |
| `response_format` | string | `detailed` (`concise` = id+name+type only) |

---

### `meta_create_customer_audience`
Create a custom audience from an email/phone list. Provide plaintext values — the server normalises and SHA-256 hashes them automatically. Minimum 100 matched users for delivery.

| Parameter | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `emails` | string[] | No |
| `phones` | string[] | No |
| `description` | string | No |

---

### `meta_create_lookalike_audience`
Create a Lookalike Audience — Meta finds users similar to a seed audience.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `source_audience_id` | string | Yes | Seed custom audience (1,000–5,000 users recommended) |
| `country` | string | Yes | 2-letter ISO country code |
| `ratio` | number | No | 0.01–0.20 (default: 0.01 = top 1% most similar) |
| `type` | string | No | `similarity` (default) or `reach` |

---

### `meta_create_website_audience`
Create a pixel-based website visitor retargeting audience.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `pixel_id` | string | Yes | From `meta_list_pixels` |
| `retention_days` | number | No | 1–180 (default: 30) |
| `rules` | array | No | URL/event inclusion filters: `[{ type: "url"|"event", operator: "contains"|"equals"|"not_contains"|"starts_with", value }]` |
| `exclude_rules` | array | No | Same shape — people to EXCLUDE from the audience |

---

### `meta_create_engagement_audience`
Audience of people who engaged with a Facebook Page or Instagram profile.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `source_id` | string | Yes | Page or Instagram account ID |
| `source_type` | string | No | `page` (default) or `instagram` |
| `engagement_type` | string | Yes | Page: `page_engaged`, `page_liked`, `page_post_engaged`, `page_call_to_action_clicked`. Instagram: `ig_business_profile_all`, `ig_business_profile_engaged`, `ig_business_profile_visited` |
| `retention_days` | number | No | 1–365 (default: 30) |

---

### `meta_create_video_audience`
Retarget people who watched a percentage of a video.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `video_id` | string | Yes | From `meta_list_ad_videos` |
| `engagement_type` | string | Yes | `video_opened`, `video_25_watched`, `video_50_watched`, `video_75_watched`, `video_95_watched` |
| `retention_days` | number | No | 1–365 (default: 30) |

---

### `meta_delete_audience`
Permanently delete a custom audience. Cannot be undone; removes it from any active ad sets.

| Parameter | Type | Required |
|---|---|---|
| `audience_id` | string | Yes |

---

## Automated Rules

### `meta_list_rules`
List automated rules with conditions, action, schedule, and status.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 (max 50) |
| `response_format` | string | `detailed` (`concise` = id+name+status only) |

---

### `meta_create_rule`
Create an automated rule that monitors performance and takes action when conditions are met.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `entity_type` | string | Yes | `CAMPAIGN`, `ADSET`, `AD` |
| `action` | string | Yes | `PAUSE`, `UNPAUSE`, `INCREASE_DAILY_BUDGET`, `DECREASE_DAILY_BUDGET`, `INCREASE_BID`, `DECREASE_BID`, `SEND_ALERT` |
| `conditions` | array | Yes | `[{ field, operator, value }]` — field: `cost_per_result`, `spend`, `roas`, `ctr`, `impressions`, etc. Operator: `GREATER_THAN`, `LESS_THAN`, `EQUAL`, `NOT_EQUAL`, `IN_RANGE` |
| `action_value` | number | No | Percentage for budget/bid actions (e.g. `20` = 20%) |
| `schedule` | string | No | `SEMI_HOURLY`, `HOURLY`, `EVERY_6_HOURS`, `EVERY_12_HOURS`, `DAILY` (default), `WEEKLY` |
| `evaluation_window` | string | No | `TODAY`, `LAST_7_DAYS` (default), `LAST_14_DAYS`, `LAST_30_DAYS` |

---

### `meta_update_rule`
Enable, disable, or rename an automated rule.

| Parameter | Type | Required |
|---|---|---|
| `rule_id` | string | Yes |
| `status` | string | No — `ENABLED` or `DISABLED` |
| `name` | string | No |

---

### `meta_delete_rule`
Permanently delete an automated rule. Cannot be undone.

| Parameter | Type | Required |
|---|---|---|
| `rule_id` | string | Yes |

---

## Lead Generation

### `meta_list_lead_forms`
List lead generation forms with status and lead count.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 (max 50) |
| `response_format` | string | `detailed` (`concise` = id+name only) |

---

### `meta_create_lead_form`
Create a native Meta lead generation form attached to a Facebook Page.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `page_id` | string | Yes | Facebook Page ID to attach the form to |
| `name` | string | Yes | Internal form name (not shown to users) |
| `questions` | array | No | Fields: `EMAIL`, `PHONE`, `FULL_NAME`, `FIRST_NAME`, `LAST_NAME`, `CITY`, `STATE`, `ZIP`, `COUNTRY`, `COMPANY_NAME`, `JOB_TITLE`, `WORK_EMAIL`, `CUSTOM`, `MULTIPLE_CHOICE`. For CUSTOM/MULTIPLE_CHOICE, also provide `label`. For MULTIPLE_CHOICE, also provide `options: string[]`. |
| `privacy_policy_url` | string | No | Required by Meta for all lead forms |
| `context_card_title` | string | No | Intro card headline (improves conversion) |
| `context_card_content` | string | No | Intro card body text |
| `thank_you_message` | string | No | Confirmation message after submission |
| `locale` | string | No | Form display language: `en_US`, `es_ES`, `fr_FR`, `de_DE`, `pt_BR`, `ja_JP`, etc. |
| `is_optimized_for_quality` | boolean | No | Adds friction to filter low-intent users — lowers volume, improves quality |

---

### `meta_get_leads`
Retrieve lead submissions from a form.

| Parameter | Type | Required |
|---|---|---|
| `form_id` | string | Yes |
| `limit` | number | No (default: 25) |

---

## Conversions API (CAPI)

### `meta_send_conversions_event`
Send a server-side event to a Meta Pixel with automatic SHA-256 PII hashing. Use for iOS 14+ signal recovery and deduplication.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `pixel_id` | string | Yes | |
| `event_name` | string | Yes | `Purchase`, `Lead`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `CompleteRegistration`, `Subscribe`, `StartTrial` |
| `event_time` | number | No | Unix timestamp (default: now) |
| `event_source_url` | string | No | Page URL where the event occurred |
| `value` | number | No | Order/event value |
| `currency` | string | No | ISO 4217 (default: `USD`) |
| `email` | string | No | **Hashed automatically** |
| `phone` | string | No | **Hashed automatically** |
| `first_name` | string | No | **Hashed automatically** |
| `last_name` | string | No | **Hashed automatically** |
| `city` | string | No | **Hashed automatically** |
| `state` | string | No | **Hashed automatically** |
| `zip` | string | No | **Hashed automatically** |
| `country` | string | No | **Hashed automatically** |
| `external_id` | string | No | **Hashed automatically** |
| `client_ip_address` | string | No | Sent unhashed |
| `client_user_agent` | string | No | Sent unhashed |
| `fbc` | string | No | Facebook click ID cookie (`_fbc`) |
| `fbp` | string | No | Facebook browser ID cookie (`_fbp`) |
| `event_id` | string | No | Deduplication ID — match the browser event's `eventID` |
| `test_event_code` | string | No | Use with Meta Events Manager test tool |
| `action_source` | string | No | `website` (default), `app`, `phone_call`, `chat`, `email`, `other` |

---

## Product Catalogs (DPA)

### `meta_list_product_catalogs`
List all product catalogs in the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 10 |

Returns: `{ catalogs: [{ id, name, vertical, product_count }] }`

---

### `meta_get_catalog`
Get details for a specific catalog.

| Parameter | Type | Required |
|---|---|---|
| `catalog_id` | string | Yes |

---

### `meta_list_catalog_products`
Browse products in a catalog with optional search and availability filter.

| Parameter | Type | Default |
|---|---|---|
| `catalog_id` | string | Required |
| `limit` | number | 20 |
| `filter_availability` | string | — (`in stock`, `out of stock`, `preorder`, `available for order`) |
| `search` | string | — (search by product name/description) |

---

### `meta_list_product_sets`
List product sets (filtered subsets) within a catalog.

| Parameter | Type | Default |
|---|---|---|
| `catalog_id` | string | Required |
| `limit` | number | 10 |

---

## A/B Testing

### `meta_list_ab_tests`
List A/B split tests (ad studies) in the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 10 |

---

### `meta_create_ab_test`
Create a 50/50 split test comparing two campaigns on a single variable.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `campaign_a_id` | string | Yes | Control campaign (should be PAUSED) |
| `campaign_b_id` | string | Yes | Variant campaign (should be PAUSED) |
| `variable` | string | Yes | `CREATIVE`, `PLACEMENT`, `TARGETING`, `BUDGET_OPTIMIZATION` |
| `optimization_metric` | string | No | `COST_PER_RESULT` (default) or `ROAS` |
| `end_time` | string | No | ISO 8601 (7+ days recommended) |
| `confidence_level` | number | No | `0.90`, `0.95` (default), or `0.99` |

Returns: `{ success, test_id, name, variable, optimization_metric, confidence_level, campaign_a, campaign_b, end_time }`

---

## Pixels

### `meta_list_pixels`
List Meta Pixels: ID, name, last-fired time, and availability status.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 10 (max 25) |

---

### `meta_get_pixel_events`
Get event counts fired by a pixel, broken down by event name. Use to verify tracking is working.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `pixel_id` | string | Yes | From `meta_list_pixels` |
| `time_range` | string | No | `last_3d`, `last_7d` (default), `last_14d`, `last_30d` |

---

## Creative Library & Ads Library

### `meta_list_ad_images`
Browse uploaded ad images in the account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |
| `after` | string | — |

---

### `meta_list_ad_videos`
Browse uploaded ad videos in the account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |
| `after` | string | — |

---

### `meta_get_ad_image`
Fetch and display an ad creative image inline in Claude (base64 decoded).

| Parameter | Type | Required |
|---|---|---|
| `image_hash` | string | Yes |

---

### `meta_search_ads_library`
Search the Meta Ads Library for competitor intelligence.

| Parameter | Type | Required |
|---|---|---|
| `search_terms` | string | Yes |
| `ad_reached_countries` | string[] | No (default: `["US"]`) |
| `ad_type` | string | No — `ALL` (default), `POLITICAL_AND_ISSUE_ADS` |
| `limit` | number | No (default: 10) |

---

## Value Rules (Advanced Bidding)

> **Optional feature** — Value Rules are not used by default. Claude will only call these tools when you explicitly ask to create or manage them.

Value Rules tell Meta's auction algorithm how much a conversion from a specific audience segment, device, placement, or location is worth to your business. They adjust bids **in real time**, per impression — before the auction is resolved. This is fundamentally different from Automated Rules (which react to performance after the fact).

**When to use them:** You have measurable evidence that one segment generates higher customer lifetime value than another — e.g. iOS users purchase again at 3× the rate, or customers in California spend 2× the average order value.

**Meta's official caveat:** Overall CPA may increase when using Value Rules. Use only when segment-level LTV differences are real and measurable.

**Supported conditions:** `user_os` · `country` · `region` · `city` · `age` · `gender` · `publisher_platform` · `placement`

**Multiplier range:** 0.1 (−90%) to 10.0 (+1,000%). Rules are evaluated in priority order; only the first matching rule applies per impression.

**Campaign compatibility:** OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_APP_PROMOTION, OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT. Not available for Shop, Web+Shop, or special ad category campaigns (housing, employment, credit).

---

### `meta_list_value_rules`
List all Value Rules configured for the ad account.

| Parameter | Type | Default |
|---|---|---|
| `limit` | number | 25 |

Returns: `{ value_rules: [{ id, name, status, priority, multiplier, multiplier_display, conditions }], total }`

---

### `meta_create_value_rule`
Create a Value Rule that adjusts Meta's bidding for a specific segment.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Display name (e.g. "Boost iOS", "Reduce Audience Network") |
| `conditions` | array | Yes | 1–2 conditions (AND-ed). Each: `{ field, operator, values }` |
| `multiplier` | number | Yes | 0.1–10.0. `1.5` = bid 50% more. `0.7` = bid 30% less. |
| `priority` | number | No | Evaluation order (lower = first). Default: appended last. |
| `status` | string | No | `ENABLED` (default) or `DISABLED` |
| `campaign_id` | string | No | Associate with a specific campaign. Omit for account-level. |

**Condition fields and their values:**

| `field` | Example `values` |
|---|---|
| `user_os` | `["IOS"]`, `["ANDROID"]`, `["IOS", "ANDROID"]` |
| `country` | `["US", "CA", "GB"]` |
| `age` | `["25-34", "35-44"]` |
| `gender` | `["1"]` (male) or `["2"]` (female) |
| `publisher_platform` | `["instagram"]`, `["audience_network"]` |
| `placement` | `["reels"]`, `["feed", "story"]` |

**Operators:** `i_contains` (IS one of) · `i_not_contains` (is NOT one of)

---

### `meta_update_value_rule`
Update an existing Value Rule. Only provide fields to change.

| Parameter | Type | Required |
|---|---|---|
| `value_rule_id` | string | Yes |
| `name` | string | No |
| `multiplier` | number | No |
| `status` | string | No — `ENABLED` or `DISABLED` |
| `priority` | number | No |
| `conditions` | array | No — replaces all existing conditions |

---

### `meta_delete_value_rule`
Permanently delete a Value Rule. Bidding returns to baseline for affected segments immediately.

| Parameter | Type | Required |
|---|---|---|
| `value_rule_id` | string | Yes |

---

## High Demand Periods (Advanced Budget Scheduling)

> **Optional feature** — High Demand Period budget schedules are not used by default. Claude will only call these tools when you explicitly ask.

High Demand Periods let you pre-schedule a temporary budget boost for a specific time window — Black Friday, Cyber Monday, a weekend flash sale, a product launch, or any other period where you expect higher purchase intent. The boost activates and expires automatically with no manual intervention.

**Requirements & Meta constraints:**
- Campaign must have **Campaign Budget Optimization (CBO)** enabled
- Period must be at least **3 hours** long
- ABSOLUTE budget cannot exceed **8× the campaign's daily budget**
- Maximum **50 schedules** per campaign
- Schedules cannot overlap

**Budget value types:**
- `ABSOLUTE` — set an explicit budget cap in account currency for the period (value in cents, e.g. 10000 = $100)
- `MULTIPLIER` — scale the existing daily budget by a factor (e.g. 2.0 = double it, 1.5 = +50%)

---

### `meta_list_budget_schedules`
List all High Demand Period budget schedules for a CBO campaign.

| Parameter | Type | Required |
|---|---|---|
| `campaign_id` | string | Yes |

Returns: `{ campaign_id, budget_schedules: [{ id, budget_value, budget_value_type, budget_display, time_start, time_end, time_start_human, time_end_human, status }], total }`

---

### `meta_create_budget_schedule`
Schedule a budget boost for a specific time window on a CBO campaign.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `campaign_id` | string | Yes | Must be a CBO campaign |
| `budget_value` | number | Yes | Cents for ABSOLUTE (e.g. 15000 = $150), decimal for MULTIPLIER (e.g. 2.0) |
| `budget_value_type` | string | Yes | `ABSOLUTE` or `MULTIPLIER` |
| `time_start` | number | Yes | Unix timestamp (seconds) for boost start |
| `time_end` | number | Yes | Unix timestamp (seconds) for boost end (min 3h after start) |

Returns: `{ success, budget_schedule_id, campaign_id, budget_display, time_start_human, time_end_human, duration_hours }`

---

### `meta_delete_budget_schedule`
Cancel a scheduled budget boost. If already active, reverts the budget immediately.

| Parameter | Type | Required |
|---|---|---|
| `budget_schedule_id` | string | Yes |

---

## Architecture Notes

- **API**: Meta Graph API v25.0, called via the Facebook Business SDK and direct `fetch` for endpoints not in the SDK
- **Rate limiting**: All API calls go through a shared score-based rate limiter with exponential backoff (`utils/rate-limiter.ts`)
- **DRY_RUN**: Set `DRY_RUN=true` in env to simulate all write operations without touching the API — every write tool returns a `dry_run: true` confirmation
- **Error handling**: Meta API errors are extracted and formatted with human-readable titles. Auth errors (code 190) prompt re-authentication; rate limits (code 4/17) suggest retry; permission errors (code 10) flag token scope issues.
- **PII hashing**: All PII fields (email, phone, name, address) are SHA-256 hashed before leaving the server (`conversions.ts`, `audience.ts`)
- **Atomic campaign creation**: `meta_deploy_campaign` rolls back all steps on failure — no zombie campaigns or orphaned ad sets
