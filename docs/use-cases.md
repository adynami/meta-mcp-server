# Use Cases & Workflows

Practical examples of what you can accomplish with the Meta MCP Server. Each scenario shows the natural-language prompts you'd give Claude and the tools it uses behind the scenes.

---

## Table of Contents

1. [Performance Analysis & Reporting](#1-performance-analysis--reporting)
2. [Campaign Launch & Setup](#2-campaign-launch--setup)
3. [Creative Testing](#3-creative-testing)
4. [Audience Building & Retargeting](#4-audience-building--retargeting)
5. [Budget & Bidding Optimization](#5-budget--bidding-optimization)
6. [Lead Generation](#6-lead-generation)
7. [E-commerce & Dynamic Product Ads](#7-e-commerce--dynamic-product-ads)
8. [Signal Recovery (iOS 14+)](#8-signal-recovery-ios-14)
9. [Compliance & Account Health](#9-compliance--account-health)
10. [Competitive Intelligence](#10-competitive-intelligence)
11. [Zero-Conversion Diagnostics & Creative Iteration](#11-zero-conversion-diagnostics--creative-iteration)
12. [Value Rules — Advanced Bid Adjustment](#12-value-rules--advanced-bid-adjustment)
13. [High Demand Periods — Scheduled Budget Boosts](#13-high-demand-periods--scheduled-budget-boosts)
14. [Creative Intelligence & The Campaign Iteration Loop](#14-creative-intelligence--the-campaign-iteration-loop)
15. [UGC Video Ad Pipeline](#15-ugc-video-ad-pipeline)

---

## 1. Performance Analysis & Reporting

### 1.1 Weekly Account Health Check

**Scenario:** You want a fast summary of how your entire account performed this week versus last week — without pulling a manual report.

**Claude prompts:**

```
How are my ads doing this week?
```

```
Give me a performance summary for the last 7 days. Flag anything that looks off.
```

**Tools called:**
- `meta_account_intelligence` — generates the period-over-period summary with top performers and "bleeders" in a single call

**Example output you will get:**
- Spend: $1,240 (+8% vs prior week)
- ROAS: 3.2x (down from 3.8x — worth investigating)
- Top campaign: "Summer Sale — Retargeting" at 5.1x ROAS
- Bleeder: "Broad Prospecting v3" — $180 spent, 0 conversions in 7 days

**Tips:**
- Use `response_format: detailed` if you want the raw trend data to build your own summary
- Follow up with "Which campaigns are hurting my ROAS?" to drill deeper by campaign

---

### 1.2 Campaign-Level Performance Breakdown

**Scenario:** A specific campaign is underperforming and you need to understand which ad sets and ads are dragging down results.

**Claude prompts:**

```
Break down performance for my "Black Friday 2025" campaign by ad set for the last 14 days.
```

```
Show me ad-level results for campaign 120210001234567 — I want to see CPA and ROAS for each ad.
```

**Tools called:**
- `meta_get_insights` (level: `campaign`, then `adset`, then `ad`)
- `meta_list_adsets` — to map ad set IDs to names
- `meta_list_ads` — to map ad IDs to names

**Tips:**
- Ask Claude to sort by CPA ascending so your worst performers appear first
- Pair with a breakdown by placement (`meta_get_breakdown_insights`, breakdown: `placement`) to see if Instagram vs Facebook is the issue

---

### 1.3 Demographic Breakdown Report

**Scenario:** You are running a consumer product campaign and want to know which age/gender segments are driving the most efficient conversions, so you can adjust targeting.

**Claude prompts:**

```
Break down my last 30 days of spend by age and gender. Which segments have the best CPA?
```

```
Show me a country breakdown for my "EU Expansion" campaign over the last month.
```

**Tools called:**
- `meta_get_breakdown_insights` (breakdown: `age_gender` or `country`, time_range: `last_30d`)

**Example insight:**
- Women 25-34: CPA $18.40, ROAS 4.1x (best segment)
- Men 55-64: CPA $61.20, ROAS 0.9x (unprofitable — consider excluding)

**Tips:**
- Use `breakdown: platform` to compare Facebook vs Instagram vs Audience Network
- Use `breakdown: device` to check if mobile vs desktop cost differences justify separate ad sets
- Combine with `time_series: weekly` to see if a segment is improving or declining over time

---

### 1.4 Attribution Window Comparison

**Scenario:** Post-iOS 14, you suspect your reported conversions look different across attribution windows. You need to understand the real impact before reporting to stakeholders.

**Claude prompts:**

```
Compare my conversion numbers using 1-day click vs 7-day click attribution for last month.
```

```
What does my ROAS look like under a 28-day click window versus 7-day click for the
"Holiday Push" campaign?
```

**Tools called:**
- `meta_get_breakdown_insights` called twice — once with `attribution_window: 1d_click`, once with `attribution_window: 7d_click`
- `meta_get_insights` with `attribution_window: 28d_click_1d_view` for the broader view

**Tips:**
- 7-day click is the current Meta default after iOS 14 changes; 1-day click is useful for fast-feedback channels
- A large gap between 1d and 7d click usually means your customers have a longer consideration cycle
- Always document which window you used when presenting ROAS numbers to stakeholders

---

## 2. Campaign Launch & Setup

### 2.1 Launch a New Sales Campaign (Image Ad)

**Scenario:** You have a new product promotion and want to get a full campaign live — targeting US women 28-45 interested in fitness — within minutes.

**Claude prompts:**

```
Upload the image at /Users/me/Desktop/summer-sale-banner.jpg and then launch a sales
campaign targeting US women aged 28-45, $50/day budget, with this copy:
  Headline: "Finally, leggings that last"
  Body: "Shop our summer collection — free shipping on orders over $75."
  URL: https://mystore.com/summer
  CTA: SHOP_NOW
```

**Tools called:**
1. `meta_upload_image` — uploads the image, returns `image_hash`
2. `meta_list_pages` — confirms which Facebook Page to attach the ad to
3. `meta_deploy_campaign` — creates Campaign + Ad Set + Ad atomically

**What gets created:**
- Campaign: objective `OUTCOME_SALES`, CBO, $50/day
- Ad Set: women 28-45, US, optimizing for OFFSITE_CONVERSIONS
- Ad: image creative with the provided headline, body, and URL

**Tips:**
- If any step fails (e.g., image rejected), the entire operation rolls back — no zombie campaigns
- Add `start_immediately: false` if you want to review the setup in Ads Manager before going live
- Recommended image specs: 1080x1080px (1:1) or 1200x628px (1.91:1)

---

### 2.2 Launch a Video Awareness Campaign

**Scenario:** You are launching a brand awareness push in Canada and Australia and want to run a video ad at $100/day with a lifetime budget over the next 30 days.

**Claude prompts:**

```
I want to run a brand awareness campaign in Canada and Australia for the next 30 days
with a $3,000 total budget. Target all adults 18-54. Page ID is 9876543210.
  Headline: "We're different. Here's why."
  Body: "Over 200,000 customers trust us. Come see what the fuss is about."
  URL: https://mybrand.com/story
  Image hash: dd99ee88ff77
```

**Tools called:**
- `meta_deploy_campaign` with:
  - objective: `OUTCOME_AWARENESS`
  - targeting: `geo_locations: { countries: ["CA", "AU"] }`, age 18-54
  - `budget_type: lifetime`, budget: 3000, `end_time: 2026-03-25T23:59:59Z`

**Tips:**
- For video creatives, upload through Meta Business Manager first to get a video ID, then reference it when deploying
- Awareness campaigns optimize for reach; expect lower CPC but meaningful frequency caps
- Lifetime budgets require an `end_time` — always provide one in ISO 8601 format

---

### 2.3 Launch a Campaign with UTM Tracking

**Scenario:** Your analytics team needs every ad click tracked with UTM parameters so GA4 attribution matches Meta reporting.

**Claude prompts:**

```
Launch a traffic campaign for our blog post. Target US men and women 25-44,
$30/day, with UTM tags: source=facebook, medium=paid_social, campaign=blog-promo-feb.

Image hash: abc123def456
Page ID: 1122334455
Headline: "The 2026 Guide to Home Refinancing"
Body: "Everything you need to know about rates, timing, and lenders."
URL: https://mysite.com/blog/refinancing-guide
```

**Tools called:**
- `meta_deploy_campaign` with `url_tags: "utm_source=facebook&utm_medium=paid_social&utm_campaign=blog-promo-feb"`

**Tips:**
- `url_tags` are appended to the destination URL automatically by Meta — you do not need to modify the link URL itself
- Always include `utm_content` with the ad name to distinguish ad variants in GA4
- Use `{{adset.name}}` as a dynamic UTM value if you want Meta to auto-populate ad set names in your analytics

---

### 2.4 Duplicate a Campaign for a New Market

**Scenario:** Your US campaign is performing well. You want to clone it for the UK market, swap in UK-specific landing page URLs, and set a conservative test budget.

**Claude prompts:**

```
Duplicate campaign 120210009876543 for the UK market. Name it "UK Test — Spring Launch".
Use these landing pages for the three ad sets:
  - https://mystore.co.uk/spring-sale
  - https://mystore.co.uk/spring-sale?variant=b
  - https://mystore.co.uk/spring-sale?utm_campaign=uk-test
Set $25/day per ad set.
```

**Tools called:**
- `meta_duplicate_campaign` with `new_name`, `funnel_urls` (array of 3), `daily_budget_per_adset: 25`

**What happens behind the scenes:**
1. Meta's async copy job runs and is polled until complete
2. New ad sets get the $25/day budget applied
3. New ad creatives are created with the swapped UK URLs (original campaign is untouched)
4. Everything is created in PAUSED status — you review before activating

**Tips:**
- The funnel URLs must be provided in the same order that Meta returns the ad sets — Claude handles the ordering automatically
- Always review the duplicated campaign in Ads Manager before activating; double-check that pixels and targeting carried over correctly
- For market expansion, also update the geo targeting in the new campaign after duplication via `meta_update_adset`

---

## 3. Creative Testing

### 3.1 Add a Creative Variant to an Existing Ad Set

**Scenario:** Your current ad has been running for 3 weeks and frequency is climbing past 4.0. You want to introduce a fresh creative to the same ad set to combat ad fatigue without restructuring the campaign.

**Claude prompts:**

```
Add a new ad to ad set 23856789012345. Here are the details:
  Image hash: ff8833aa2211cc
  Page ID: 1122334455
  Ad name: "Spring Hero v2 — Lifestyle Shot"
  Headline: "Spring is here. Are you?"
  Body: "New arrivals just dropped. Shop the collection before it sells out."
  URL: https://mystore.com/new-arrivals
  CTA: SHOP_NOW
Start it paused so I can review first.
```

**Tools called:**
- `meta_upload_image` (if image hash not yet known)
- `meta_add_ad` with `status: PAUSED`

**Tips:**
- New ads default to PAUSED — always review in Ads Manager to confirm creative looks right before activating
- Avoid running more than 3-5 active ads per ad set; Meta's delivery system needs volume to learn which creative wins
- Consider naming conventions like `[Hook Type] — [Visual] — [Date]` so you can track what is being tested at a glance

---

### 3.2 Run a Formal A/B Split Test

**Scenario:** You want to scientifically test whether a testimonial-style creative outperforms your current product-feature creative, with statistical confidence before scaling the winner.

**Claude prompts:**

```
Set up an A/B test between campaign 120210001111111 (our current product ad) and
campaign 120210002222222 (the new testimonial version). Test variable: creative.
Run it for 14 days with 95% confidence level. Optimize for cost per result.
```

**Tools called:**
1. `meta_list_ab_tests` — check for any existing conflicting tests
2. `meta_create_ab_test` with:
   - `campaign_a_id: 120210001111111`, `campaign_b_id: 120210002222222`
   - `variable: CREATIVE`
   - `confidence_level: 0.95`
   - `end_time: 2026-03-09T23:59:59Z`

**Tips:**
- Both campaigns should be PAUSED before creating the test; Meta activates them at test start
- Run for at least 7 days and ideally until you have 50+ conversions per variant for reliable results
- Do not modify either campaign while the test is running — changes invalidate the split
- After the test ends, use `meta_list_ab_tests` to retrieve results and identify the winner

---

### 3.3 Preview an Ad Before Launch

**Scenario:** A client wants to approve the creative before the campaign goes live. You need a shareable preview link without giving the client access to Ads Manager.

**Claude prompts:**

```
Generate a preview of ad 23856790000001 in mobile feed format.
```

```
Show me what ad 23856790000001 looks like as an Instagram Story.
```

**Tools called:**
- `meta_get_ad_preview` with `ad_format: MOBILE_FEED_STANDARD` or `INSTAGRAM_STORY`

**What you get back:**
- A shareable link you can send to the client directly
- An iframe snippet for embedding in a creative approval doc or internal review tool

**Tips:**
- Always preview in the placements you are actually targeting — a 1:1 image that looks great in feed can appear cropped in Stories
- Check both `DESKTOP_FEED_STANDARD` and `MOBILE_FEED_STANDARD` since text rendering differs between the two
- Preview links expire after approximately 24 hours; generate fresh ones for review meetings

---

### 3.4 Audit Creative Performance Across the Account

**Scenario:** Before a quarterly creative refresh, you want to identify which assets have been top performers and which are dead weight, so you know what to replicate and what to retire.

**Claude prompts:**

```
Show me ad-level performance for the last 30 days. I want to see the top 10 and
bottom 10 ads ranked by ROAS.
```

```
List all my ad images in the creative library so I know what assets I have available.
```

**Tools called:**
- `meta_get_insights` (level: `ad`, time_range: `last_30d`, limit: 50)
- `meta_list_ad_images` — to cross-reference image hashes with live ads
- `meta_list_ad_videos` — to inventory video assets
- `meta_get_creative_details` — to pull the full spec of top-performing creatives

**Tips:**
- Cross-reference top-performing image hashes against your creative library to identify which visual styles to replicate
- Archive ads with zero conversions after 14+ days and $50+ spend — they drain the learning budget
- Use `meta_get_creative_details` on your best ads to extract the exact copy and creative spec for future reference and briefing

---

## 4. Audience Building & Retargeting

### 4.1 Build a Website Retargeting Audience

**Scenario:** You want to retarget everyone who visited your website in the last 30 days but did not purchase, using your Meta Pixel.

**Claude prompts:**

```
Create a custom audience of people who visited my website in the last 30 days using
pixel 858047089973360. Name it "Website Visitors — 30d".
```

**Tools called:**
- `meta_create_custom_audience` with:
  - `subtype: WEBSITE`
  - `pixel_id: 858047089973360`
  - `retention_days: 30`
  - rule targeting URL contains your domain

**Tips:**
- For an abandoned-cart audience, scope the rule to the `/cart` or `/checkout` URL path
- Exclude purchasers by creating a separate "Purchasers — 30d" audience and using it as an exclusion in your retargeting ad set
- Website audiences take 24-48 hours to populate; create them in advance of your campaign launch

---

### 4.2 Create a Customer List Lookalike

**Scenario:** You have a list of 15,000 high-value customers. You want to find new people on Facebook who look like them.

**Claude prompts:**

```
Create a lookalike audience based on customer list audience 6123456789012.
Target the US, 1% similarity. Name it "US LAL 1% — High Value Customers".
```

**Tools called:**
- `meta_create_lookalike_audience` with:
  - `source_audience_id: 6123456789012`
  - `country: US`
  - `ratio: 0.01` (1%)
  - `name: "US LAL 1% — High Value Customers"`

**Audience sizing by similarity percentage (US):**
- 1% LAL: ~2.1 million people — highest similarity, best for initial testing
- 3% LAL: ~6.3 million people — broader, useful for scaling
- 10% LAL: ~21 million people — volume play, lowest similarity

**Tips:**
- Your source audience needs at least 100 people to generate a lookalike; 1,000+ gives Meta better signal
- Upload your customer list first using `meta_create_customer_list_audience` with email/phone fields (auto-hashed before sending)
- Test 1% vs 3% vs 5% in separate ad sets to find the efficiency sweet spot for your account

---

### 4.3 Build a Page Engagement Retargeting Audience

**Scenario:** You ran a brand awareness campaign and got significant Facebook Page engagement. Now you want to retarget those engaged users with a conversion offer.

**Claude prompts:**

```
Create an audience of everyone who engaged with our Facebook Page in the last 60 days.
Page ID is 1234567890. Name it "Page Engagers — 60d".
```

```
Build an Instagram engagement audience for the last 90 days from IG account 9876543210.
Name it "IG Engagers — 90d".
```

**Tools called:**
- `meta_create_engagement_audience` with:
  - `source_id: 1234567890`
  - `source_type: page`
  - `engagement_type: page_engaged`
  - `retention_days: 60`

**Tips:**
- `page_engaged` captures the broadest set: people who liked, commented, shared, clicked, or messaged
- For a warmer retargeting pool, use `page_cta_clicked` to target only people who clicked a call-to-action button
- Instagram engagement audiences (`source_type: instagram`) are built from your connected IG business profile
- Combine page engagement and website visitor audiences into one retargeting ad set for maximum coverage at low cost

---

### 4.4 Build a Video View Retargeting Audience

**Scenario:** You ran a top-of-funnel video ad last month. Now you want to retarget the most engaged viewers — people who watched 75%+ of the video — with a direct conversion offer.

**Claude prompts:**

```
Create an audience of people who watched at least 75% of video 1234567890123456 in
the last 14 days. Name it "Video Viewers 75% — 14d".
```

**Tools called:**
- `meta_create_video_audience` with:
  - `video_id: 1234567890123456`
  - `engagement_type: video_75_watched`
  - `retention_days: 14`

**Engagement type options and what they capture:**

| Type | Who it captures |
|---|---|
| `video_opened` | Anyone who played the video for any duration |
| `video_25_watched` | Watched 25% or more |
| `video_50_watched` | Watched 50% or more (mid-funnel warm) |
| `video_75_watched` | Watched 75% or more (high intent) |
| `video_95_watched` | Nearly completed — most qualified viewers |

**Tips:**
- Stack video view audiences into a funnel: retarget 75%+ viewers with a strong purchase offer, retarget 25-74% viewers with a softer middle-funnel message
- 14-day retention windows keep the audience fresh and tied to recent interest
- Use `meta_predict_reach` to estimate audience size before building out the ad set targeting this audience

---

### 4.5 Predict Reach Before Launching

**Scenario:** Before committing budget to a new targeting configuration, you want to estimate audience size and expected daily reach so you can right-size the budget.

**Claude prompts:**

```
Estimate the reach for this targeting at $75/day: US women 30-50, interested in yoga
and wellness, Advantage+ audience disabled.
```

**Tools called:**
- `meta_predict_reach` with targeting spec and `daily_budget_usd: 75`

**Example output:**
- Estimated daily reach: 18,000-52,000 people
- Estimated daily impressions: 22,000-65,000
- Estimated daily results (link clicks): 180-520

**Tips:**
- Run reach predictions before launching new audiences — if estimated reach is under 10,000, your targeting is too narrow and will struggle to win auctions
- Advantage+ audience (automated targeting) consistently delivers higher reach estimates; Meta uses your manual spec as a signal hint
- Use predictions to size budgets: if you want 50,000 daily impressions and CPM is ~$12, you need ~$600/day

---

## 5. Budget & Bidding Optimization

### 5.1 Identify Budget Waste and Pause Non-Performers

**Scenario:** Your account has 12 active campaigns and you need to quickly identify which ones are spending money without generating returns, so you can pause them before the monthly cap is hit.

**Claude prompts:**

```
Show me all active campaigns and their ROAS for the last 14 days. Flag any campaigns
spending more than $100 with a ROAS below 1.5x.
```

```
Pause campaigns 120210001111111, 120210002222222, and 120210003333333 — they have been
underperforming for two weeks.
```

**Tools called:**
1. `meta_get_insights` (level: `campaign`, time_range: `last_14d`)
2. `meta_bulk_update_status` with `ids: [...]`, `status: PAUSED`

**Tips:**
- `meta_bulk_update_status` handles up to 50 IDs in one call — much faster than pausing one by one
- Before pausing, run `meta_debug_ad` on a sample ad from each campaign — sometimes the issue is a disapproved ad, not the strategy itself
- Set a recurring cadence: use `meta_account_intelligence` every Monday morning to catch bleeders before they drain weekly budget

---

### 5.2 Get Meta's Optimization Recommendations

**Scenario:** You want to know what Meta's own algorithm thinks you should change to improve performance, without hiring a consultant or attending a Meta rep call.

**Claude prompts:**

```
What optimization recommendations does Meta have for my account right now?
```

```
Show me Meta's top 5 recommendations and explain which ones are worth acting on.
```

**Tools called:**
- `meta_get_recommendations` (limit: 10)

**Example recommendations Meta might surface:**
- "Increase budget on 'Summer Retargeting' — audience saturation is low, more spend available"
- "Enable Advantage+ Audience on 'Prospecting v4' — estimated 23% CPA improvement"
- "Add more ad variations to 'Brand Awareness Q1' — only 1 active ad is limiting learning"

**Tips:**
- Treat these as informed suggestions, not mandates — Meta's recommendations are naturally biased toward increased spend
- "Learning Limited" warnings are worth acting on immediately: consolidate ad sets, increase budget, or broaden targeting
- Advantage+ Audience recommendations are worth testing in a new parallel ad set before applying broadly to existing ones

---

### 5.3 Check Account Billing and Remaining Budget

**Scenario:** You are mid-month and want to confirm how much has been spent, what your spend cap is, and whether the account will auto-pause before the month ends.

**Claude prompts:**

```
How much have we spent this month and what is our remaining budget?
```

```
Show me account billing info — I want to know our spend cap and current balance.
```

**Tools called:**
- `meta_get_account_billing`
- `meta_get_account` — cross-reference account status and currency

**Example output:**
```
Currency: USD
Amount spent this month: $8,420.00
Spend cap: $12,000.00
Remaining: $3,580.00
Funding source: Visa ending 4242
```

**Tips:**
- If `remaining` is low, raise the spend cap in Meta Business Settings before it is exhausted — campaigns pause automatically when the cap is hit with no warning
- Monthly spend cap resets depend on your billing cycle; confirm the reset date with your Meta rep or billing settings
- For agency accounts managing multiple clients, cross-reference this with the client's approved monthly budget

---

## 6. Lead Generation

### 6.1 Launch a Lead Gen Campaign with an Instant Form

**Scenario:** You are a mortgage broker wanting to capture qualified leads directly on Facebook without sending traffic to an external site, keeping the friction low for mobile users.

**Claude prompts:**

```
Create a lead generation form for our mortgage inquiry campaign. Page ID 5566778899.
  Form name: "Mortgage Rate Inquiry — Feb 2026"
  Headline: "Get Your Personalized Rate in 60 Seconds"
  Description: "Tell us about your situation and we'll match you with the best rates available."
  Questions: first name, last name, email, phone number
  Also ask: "What's your estimated home value?" with options:
    Under $300K, $300K-$600K, $600K-$1M, Over $1M
  Privacy URL: https://mortgagebroker.com/privacy
  Thank you message: "Thanks! A specialist will call you within 1 business day."
```

**Tools called:**
1. `meta_create_lead_form` with:
   - `locale: en_US`
   - `is_optimized_for_quality: true`
   - questions including `type: MULTIPLE_CHOICE` for the home value dropdown
2. `meta_deploy_campaign` with `objective: OUTCOME_LEADS`, `destination_type: ON_AD`

**Tips:**
- `is_optimized_for_quality: true` adds a friction screen ("Does this describe you?") before the form — it reduces volume by roughly 20% but significantly improves lead quality
- Facebook pre-fills name and email from the user's profile; the fewer additional fields you add, the higher the completion rate
- Always include a Privacy Policy URL — forms are rejected by Meta without one
- Download leads from Meta Business Manager or connect a CRM via webhook; submitted lead data is not accessible through this server's API tools

---

### 6.2 Multi-Language Lead Forms

**Scenario:** You are running a pan-European event registration campaign across France and Spain and need separate lead forms in the local language for each market.

**Claude prompts:**

```
Create a French lead form for our Paris event:
  Name: "Inscription Evenement Paris"
  Locale: fr_FR
  Headline: "Rejoignez-nous a Paris"
  Questions: prenom, nom, email, telephone
  Privacy URL: https://monentreprise.fr/confidentialite

Then create a Spanish version:
  Name: "Registro Evento Madrid"
  Locale: es_ES
  Headline: "Unete a nosotros en Madrid"
  Same question types in Spanish.
  Privacy URL: https://miempresa.es/privacidad
```

**Tools called:**
- `meta_create_lead_form` called twice — once per locale

**Supported locales include:**
`en_US`, `en_GB`, `es_ES`, `es_LA`, `fr_FR`, `de_DE`, `pt_BR`, `it_IT`, `ja_JP`, `ko_KR`, `zh_CN`, `zh_TW`

**Tips:**
- Meta uses the `locale` field to set the form's display language and affects how it pre-fills user profile data
- Create separate ad sets per language/country and assign the matching-language form to each ad set
- For Spanish, use `es_ES` for Spain and `es_LA` for Latin America — they differ in phrasing and formality

---

## 7. E-commerce & Dynamic Product Ads

### 7.1 Browse Your Product Catalog

**Scenario:** Before setting up a Dynamic Product Ad (DPA) campaign, you need to verify your catalog is healthy and understand which product sets are available for targeting.

**Claude prompts:**

```
List my product catalogs and show me how many products are in each one.
```

```
Show me the product sets available in catalog 987654321098765.
```

```
Show me 20 in-stock products from catalog 987654321098765.
```

**Tools called:**
1. `meta_list_product_catalogs`
2. `meta_list_product_sets` with `catalog_id: 987654321098765`
3. `meta_list_catalog_products` with `filter_availability: "in stock"`, `limit: 20`

**Example catalog health check output:**
```
Catalog: "Main Store Catalog"
  ID: 987654321098765
  Total products: 1,847
  In stock: 1,602
  Out of stock: 245 (13% — consider excluding from DPA targeting)
```

**Tips:**
- Out-of-stock products can still serve in DPAs if your feed has not been refreshed — always filter by availability when checking inventory
- Use `meta_list_product_sets` to find sets like "Best Sellers", "New Arrivals", or "Sale Items" that you may want to target specifically in separate ad sets
- Search for a specific product by name using the `search` parameter in `meta_list_catalog_products` before reporting a catalog issue

---

### 7.2 Inspect a Catalog Before Launching DPA

**Scenario:** You are about to launch a Dynamic Product Ad retargeting campaign and need to confirm the catalog is properly configured — correct vertical, live products, valid images — before pointing campaign spend at it.

**Claude prompts:**

```
Get full details for catalog 987654321098765 — I want to confirm it is set up correctly
before launching DPA ads.
```

**Tools called:**
- `meta_get_catalog`
- `meta_list_catalog_products` with `filter_availability: "out of stock"` — to spot stale feed items

**What to verify in the output:**
- `vertical` is set to `commerce` for standard e-commerce DPA
- Products have valid, non-broken image URLs (broken images cause creative rendering failures)
- Price and currency fields are populated on all products
- `product_count` matches your expected live inventory count

**Tips:**
- DPA campaigns require the catalog to be connected to a pixel firing `ViewContent`, `AddToCart`, and `Purchase` events
- If product count seems low, check your feed's ingestion schedule in Commerce Manager — Meta ingests feed files on a recurring schedule you configure there
- Combine with CAPI (`meta_send_conversions_event`) to ensure all three funnel events are recorded server-side as well

---

## 8. Signal Recovery (iOS 14+)

### 8.1 Send a Server-Side Purchase Event via CAPI

**Scenario:** iOS 14+ ATT opt-outs mean your browser pixel is missing roughly 40% of conversions. You have integrated server-side order tracking and want to send purchase events directly to Meta's Conversions API to recover that signal.

**Claude prompts:**

```
Send a purchase event to pixel 858047089973360 for an order that just came in:
  Customer email: jane.doe@example.com
  Phone: +1 555-867-5309
  Order value: $127.50, currency USD
  Page: https://mystore.com/checkout/confirmation
  Event ID: order_88291 (for deduplication with the browser pixel)
  Client IP: 203.0.113.42
  User agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)
```

**Tools called:**
- `meta_send_conversions_event` with:
  - `event_name: Purchase`
  - `value: 127.50`, `currency: USD`
  - `email`, `phone` — auto-hashed with SHA-256 before the API call
  - `event_id: order_88291` (matches the browser pixel's `eventID` for deduplication)
  - `action_source: website`

**How PII is handled:**
- Email, phone, name, and address fields are SHA-256 hashed server-side before the request leaves your environment
- Plain-text PII is never transmitted to Meta
- Meta matches the hashed values against its user graph to attribute the event to a known user

**Tips:**
- Always include `event_id` matching your browser pixel's `eventID` — this is the deduplication key that prevents double-counting the same conversion
- Include `fbc` (from the `_fbc` cookie) and `fbp` (from the `_fbp` cookie) when available — they dramatically improve match rates, especially on iOS
- Use `test_event_code` during development to verify events appear in Meta's Events Manager test panel without affecting live reporting
- Send events as close to real-time as possible; events older than 7 days are not attributed

---

### 8.2 Send Mid-Funnel Events to Improve Optimization

**Scenario:** You want to recover mid-funnel signals (Add to Cart, Initiate Checkout) that are also being lost to ATT, giving Meta's algorithm a fuller picture of your funnel to optimize against.

**Claude prompts:**

```
Send an AddToCart event for a customer who added our "Premium Annual Plan" to their cart.
  Email: buyer@email.com
  Value: $49.99, USD
  URL: https://mysite.com/pricing
  IP: 198.51.100.22
```

```
Send a Lead event for a form submission on our landing page:
  Email: newlead@company.com
  First name: Marcus
  Last name: Rodriguez
  URL: https://mysite.com/contact
  Event ID: lead_form_5521
```

**Tools called:**
- `meta_send_conversions_event` with `event_name: AddToCart` or `Lead`

**Full funnel CAPI event sequence for e-commerce:**
1. `ViewContent` — product page view
2. `AddToCart` — cart addition
3. `InitiateCheckout` — checkout started
4. `Purchase` — order completed

**Tips:**
- Sending all four funnel events gives Meta's algorithm the full purchase journey data it needs to optimize bid decisions
- For subscriptions, use `Subscribe` and `StartTrial` to differentiate trial starts from paid conversions
- `CompleteRegistration` is the right event for account sign-ups in SaaS or app onboarding flows
- Pair every CAPI event with a matching browser pixel event using the same `event_id` for deduplication

---

### 8.3 Verify Pixel Setup

**Scenario:** You have recently deployed a new pixel on a redesigned site and want to confirm it is firing correctly before scaling ad spend that depends on it for optimization.

**Claude prompts:**

```
Show me all pixels on my ad account so I can confirm which one is active and
tied to the right campaigns.
```

**Tools called:**
- `meta_list_pixels`

**Tips:**
- Use `test_event_code` in `meta_send_conversions_event` to send a test event that appears in Meta Events Manager's test tool without polluting live data
- Multiple pixels on one account is common in agency setups but can cause attribution confusion — verify each campaign references the correct pixel ID
- If a pixel shows "No activity in 3 days" in Events Manager, check both the browser-side base code and your CAPI integration independently

---

## 9. Compliance & Account Health

### 9.1 Diagnose a Disapproved or Non-Delivering Ad

**Scenario:** A campaign that was performing well suddenly stopped delivering overnight. You need to quickly find out why without manually clicking through every layer of Ads Manager.

**Claude prompts:**

```
Why has ad 23856790123456 stopped delivering? Diagnose the issue.
```

```
Ad 23856790000001 is not getting any impressions after 48 hours. What is wrong?
```

**Tools called:**
- `meta_debug_ad` — inspects the full hierarchy: ad to ad set to campaign

**What the diagnostic checks:**
- Ad review status (DISAPPROVED with rejection reason / PENDING_REVIEW / WITH_ISSUES)
- Learning phase status (LEARNING / LEARNING_LIMITED)
- Budget exhaustion at ad set and campaign level
- Whether parent entities (ad set or campaign) are paused and blocking delivery
- Performance red flags: zero impressions in 3 days, zero clicks at 1,000+ impressions, CTR below 0.5%

**Example diagnostic output:**
```
Health: CRITICAL
Issues:
  - Ad status: DISAPPROVED
  - Rejection reason: "Image or text contains prohibited content (Personal Attributes)"
  - Suggested fix: Remove references to health conditions or weight in the ad copy
```

**Tips:**
- Run `meta_debug_ad` on any ad that has been live 48+ hours with zero impressions — do not wait for Meta email notifications
- "Learning Limited" is often resolved by consolidating ad sets, increasing the daily budget above $50, or broadening the targeting spec
- Disapproved ads cannot be edited back to compliance via API; create a new ad creative with compliant copy using `meta_add_ad`

---

### 9.2 Declare Special Ad Categories for Regulated Campaigns

**Scenario:** You are launching a housing rental campaign and need to comply with Meta's Special Ad Category requirements, which restrict certain targeting options for protected-class reasons.

**Claude prompts:**

```
Launch a housing ad campaign. It's for apartment rentals so it needs to be marked
as Special Ad Category: HOUSING.
  Budget: $75/day
  Target: US, age 18+, all genders
  Image hash: aa11bb22cc33
  Page ID: 1122334455
  Headline: "Apartments in Austin — From $1,100/mo"
  Body: "Spacious 1 and 2 bedroom units available now. No application fee."
  URL: https://myapartments.com/austin
```

**Tools called:**
- `meta_deploy_campaign` with `special_ad_categories: ["HOUSING"]`

**What changes with Special Ad Categories:**
- Age targeting is locked to 18+ (no maximum age restriction allowed)
- Gender targeting is disabled — all genders are required
- Geographic radius targeting is limited (no hyperlocal zip-code-level targeting)
- Certain interest and behavior categories related to protected classes are restricted

**Categories requiring declaration:**

| Category | Examples |
|---|---|
| `HOUSING` | Rentals, home sales, mortgages, HOA services |
| `CREDIT` | Credit cards, auto loans, personal loans, BNPL |
| `EMPLOYMENT` | Job postings, recruitment, staffing agencies |
| `ISSUES_ELECTIONS_POLITICS` | Political ads, ballot measures, advocacy |

**Tips:**
- Failing to declare a required special ad category can result in ad disapproval or account-level restriction
- Special ad categories cannot be added to an existing campaign — they must be set at creation time
- For employment ads in the EU, additional age and gender targeting restrictions apply even within the permitted ranges
- When in doubt, declare the category — it is better to have some targeting restrictions than to risk account suspension

---

### 9.3 Full Account Audit and Orientation

**Scenario:** A new team member is taking over account management and needs a complete orientation: what is active, what the budget situation is, and whether anything needs immediate attention before they make changes.

**Claude prompts:**

```
Give me a full account overview: account status, active campaigns, total monthly
spend, billing info, and anything that needs immediate attention.
```

**Tools called:**
1. `meta_get_account` — account name, currency, timezone, status
2. `meta_get_account_billing` — spend, cap, remaining balance, funding source
3. `meta_list_campaigns` (status_filter: `ACTIVE`) — all currently active campaigns
4. `meta_account_intelligence` — performance summary and bleeders
5. `meta_get_recommendations` — Meta's current optimization flags

**Tips:**
- Run this audit whenever taking over an account or returning from a period of inactivity longer than a week
- An account with `status: DISABLED` requires intervention in Meta Business Settings or with Meta Support before any ads can run
- Cross-reference the bleeder list from `meta_account_intelligence` with the recommendations from `meta_get_recommendations` to prioritize actions

---

## 10. Competitive Intelligence

### 10.1 Research a Competitor's Ad Creative Strategy

**Scenario:** Before launching a campaign in a competitive direct-to-consumer category, you want to understand what messaging, offers, and creative formats your competitors are running right now.

**Claude prompts:**

```
Search the Meta Ads Library for ads from "Allbirds" in the US. Show me 10 results.
```

```
What ads is "Casper" running right now in the UK? Summarize their current messaging angles.
```

**Tools called:**
- `meta_search_ads_library` with `search_terms: "Allbirds"`, `ad_reached_countries: ["US"]`, `limit: 10`

**What you can learn from Ads Library results:**
- Whether an ad is currently active (still running = likely working)
- When the ad started running (ads running 90+ days without pausing are almost always profitable)
- Ad format used (image, video, carousel)
- Platforms the ad appears on (Facebook, Instagram, Audience Network, Messenger)
- The full ad copy, headline, and creative approach

**Tips:**
- Long-running ads (90+ days) are the most valuable to study — they have survived budget scrutiny and are worth reverse-engineering
- Search by brand name, product category keyword, or specific ad copy phrases to find relevant ads
- For regulated categories (political, housing, employment), the Ads Library provides even more transparency including spend ranges and demographic targeting data
- This tool searches the public Ads Library — it only shows active and recently-active ads, not full historical archives

---

### 10.2 Monitor a Category for Creative Trends

**Scenario:** You are entering the meal kit delivery space and want to understand the current creative trends, common offers, and messaging patterns across the category before writing creative briefs.

**Claude prompts:**

```
Search the Ads Library for "meal kit delivery" ads in the US and Canada.
Give me 15 results and summarize the common offers and creative angles you see.
```

```
What are project management SaaS tools like Monday.com, Asana, and ClickUp saying
in their current Facebook ads? What offers and hooks are they using?
```

**Tools called:**
- `meta_search_ads_library` with category keywords, `ad_reached_countries: ["US", "CA"]`, `limit: 15`

**Follow-up analysis prompts:**
```
Based on those Ads Library results, what are the 3 most common hooks?
What offers keep appearing? What creative formats are dominant — video or image?
```

**Tips:**
- Run separate searches for each major competitor rather than one broad category search — you will get more targeted and actionable results
- Note which platforms each ad runs on: an ad running only on Instagram Stories signals the advertiser has optimized that placement independently
- Combine Ads Library research with `meta_predict_reach` to estimate how large the addressable audience is for a given targeting configuration in that niche
- Use findings to brief your creative team: "Competitor X has been running testimonial videos for 4 months — we need a strong response creative"

---

## 11. Zero-Conversion Diagnostics & Creative Iteration

You've been running a campaign for several days. Traffic is flowing, money is being spent, but purchases aren't happening. Before killing the campaign or blindly swapping creatives, use the data you already have — engagement signals, funnel events, demographic splits, video retention, and placement performance — to find out exactly what's working and why conversions aren't closing. Most of the answers are already in the account.

---

### 11.1 The Pixel Funnel Audit: Find Exactly Where People Drop Off

**Scenario:** You're spending $200/day on a sales campaign and getting zero purchases. Before blaming the creative, you want to know whether people are engaging with the funnel at all — viewing the product page, adding to cart, starting checkout — or dropping off right at the first click.

**Claude prompts:**

```
Show me the full conversion funnel breakdown for our sales campaign 120210001234567
over the last 7 days. I want to see view_content, add_to_cart, initiate_checkout,
and purchase counts — not just the total conversion number.
```

```
The purchases are zero but I want to know if anyone is adding to cart or starting
checkout. Pull insights at the ad level and show me the conversion_breakdown for
each ad.
```

**Tools called:**
1. `meta_get_insights` with `level: campaign`, `campaign_id` — check `conversion_breakdown` in the response (shows `view_content`, `add_to_cart`, `initiate_checkout`, `purchase` counts from the pixel)
2. `meta_get_insights` with `level: ad` — same breakdown per ad to spot individual creative performance

**How to read the funnel:**

| Funnel Pattern | What It Means | Where to Fix |
|---|---|---|
| High `view_content`, zero `add_to_cart` | Ad is relevant enough to click but the product page isn't selling | Landing page — price, copy, trust signals |
| High `add_to_cart`, zero `initiate_checkout` | People want it but abandon before checkout | Cart page — shipping cost reveal, forced account creation |
| High `initiate_checkout`, zero `purchase` | Checkout is the friction point | Payment flow — form complexity, payment methods, delivery time |
| Zero `view_content` | Clicks aren't reaching your pixel or the pixel isn't firing | Pixel installation — check `meta_get_pixel_events` |

**Tips:**
- If `view_content` is zero but your click count is non-zero, your pixel isn't firing on the landing page — fix tracking before spending more
- A 10:3:1 ratio (view_content:add_to_cart:purchase) is roughly healthy for cold traffic; if you're at 100:1:0, the landing page is the problem, not the ad
- This analysis tells you whether to iterate on the creative (top-of-funnel problem) or the website (bottom-of-funnel problem) — two completely different fixes

---

### 11.2 Score Your Creatives by Engagement Before Any Purchase Data Arrives

**Scenario:** You launched 5 different ad creatives testing different angles (price-led, benefit-led, social proof, problem/solution, UGC style). After 3 days you have zero purchases — but 3 days is plenty of time to get statistically meaningful CTR data. Use engagement signals to rank the angles before they've proven themselves on conversions.

**Claude prompts:**

```
Show me insights for all ads in campaign 120210001234567 for the last 3 days.
I want CTR, unique CTR, outbound_clicks, CPC, and CPM for each ad — sorted by CTR.
```

```
Which of our 5 ads is generating the most genuine interest? Compare their link
click rates and tell me which angle is resonating most with the audience.
```

**Tools called:**
- `meta_get_insights` with `level: ad`, `campaign_id` — returns `ctr`, `unique_ctr`, `outbound_clicks`, `cpc`, `cpm`, `impressions` per ad

**How to interpret the engagement signals:**

| Metric | What It Tells You |
|---|---|
| `ctr` (all clicks / impressions) | Raw interest — includes post likes, comment clicks, profile taps |
| `unique_ctr` | How many distinct people clicked — filters out repeat clickers |
| `outbound_clicks` | Clicks that actually leave Facebook to your site — the most purchase-intent signal |
| `cpc` | Cost efficiency — a low-CTR ad with low CPM can still have a better CPC than a high-CTR ad on an expensive placement |
| Gap between `ctr` and `outbound_clicks` | Large gap = people are clicking within Facebook (post engagement) but not visiting your site |

**Creative scoring formula (without conversions):**
1. Rank by `outbound_clicks` descending — this is purchase intent, not just curiosity
2. Filter out any ad with fewer than 500 impressions — not enough data yet
3. The top 1-2 ads by outbound CTR are your "winners" to iterate on

**Tips:**
- A 2× difference in CTR between two ads after 1,000+ impressions each is statistically meaningful — act on it
- An ad with high CTR but low `outbound_clicks` suggests the creative generates curiosity but the copy/headline doesn't make a clear enough offer — the hook works but the call-to-action doesn't
- Use `meta_get_creative_details` on the top performers to extract their exact copy, image hash, and CTA for use in the next iteration

---

### 11.3 Video Hook Analysis: Find the Angle That Actually Holds Attention

**Scenario:** You're running 4 video ads, each opening with a different hook: a bold claim, a problem statement, a customer testimonial, and a "did you know?" fact. Zero purchases after 5 days. But video completion data tells you which opening angle makes people watch — which is the leading indicator of conversion intent.

**Claude prompts:**

```
Show me video performance for all ads in campaign 120210009999999. I want
views_3s, views at 25%, 50%, 75%, 100%, average watch time, and completion rate
for each ad.
```

```
Which of our video ads holds attention the longest? Compare completion rates
and identify which hook is keeping people watching past the 50% mark.
```

**Tools called:**
- `meta_get_insights` with `level: ad`, `campaign_id` — `video` object in each row contains `views_3s`, `views_p25`, `views_p50`, `views_p75`, `views_p100`, `avg_watch_time_sec`, `completion_rate`

**Reading the video retention curve:**

| Drop-off Point | What It Signals | What to Fix |
|---|---|---|
| <25% watch | The opening hook isn't grabbing attention | Test new opening 3 seconds — pattern interrupt, bold claim, or question |
| 25–50% | Hook works but the message doesn't sustain interest | Restructure middle — get to the core benefit faster |
| 50–75% | Story is working but close doesn't land | Sharpen the CTA and offer in final 25% |
| High `views_p75` but no outbound clicks | People watch but don't act | Add a stronger verbal or on-screen CTA mid-video and at the end |

**Iterating on the winning hook:**

```
The testimonial video has a 38% completion rate — double the others.
Duplicate creative 23856790001111 and override the URL to our new landing page.
Then let's deploy DCO using that video's thumbnail image with 3 headline variations.
```

**Tools called:**
1. `meta_duplicate_creative` with `url_override` — swap the destination without re-uploading the video
2. `meta_deploy_dco_campaign` — test 3 headline variations against the proven video thumbnail

**Tips:**
- `completion_rate` = `views_p100 / views_3s` — the single most important video metric for ad quality; anything above 25% is good for cold traffic
- Average watch time divided by video length gives you a proxy completion rate if `completion_rate` isn't populated
- A video with 40% completion but zero purchases still tells you: people believe the message, the problem is after the click. That's a landing page test, not a creative test.

---

### 11.4 The Demographic Surprise: Let the Data Pick Your Real Audience

**Scenario:** You targeted US men aged 25–44 for a fitness supplement campaign. Zero purchases after $500 spent. But before abandoning the targeting, run a demographic breakdown — you might discover your actual buyers are a completely different segment to the one you assumed.

**Claude prompts:**

```
Break down our campaign 120210001234567 by age and gender for the last 14 days.
I want CTR and spend per segment — I'm looking for unexpected high-performers.
```

```
Which age groups and genders are clicking our ads the most? Show me country
breakdown too — I want to see if any markets are outperforming.
```

**Tools called:**
1. `meta_get_breakdown_insights` with `breakdown: age_gender`, `campaign_id`
2. `meta_get_breakdown_insights` with `breakdown: country`, `campaign_id`

**What you might find (real-world examples):**

| Discovery | Implication |
|---|---|
| Women 35–44 clicking at 3× the rate of men 25–34 | Your product/message resonates more with women — create a dedicated ad set targeting them |
| Australia CTR is 4× higher than US despite tiny spend | An untapped market — scale budget in AU, test localized copy |
| Age 55+ has lowest CPC despite being excluded from the original brief | Expand the age range — older audiences are often less competitive |
| 18–24 segment has highest CTR but zero conversions | They're window shopping — tighten targeting or require purchase intent signals |

**Acting on the discovery:**

```
Create a new ad set targeting US women 35-44 only, $50/day, same creative.
And create a second targeting Australia, all genders 30-55, $25/day.
```

**Tools called:**
- `meta_estimate_audience_size` — confirm the newly-discovered segments are large enough before deploying
- `meta_deploy_campaign` — new campaign targeted to the winning demographic with identical creative

**Tips:**
- Run demographic breakdowns after at least 1,000 impressions per segment — smaller sample sizes produce misleading signals
- When a surprise segment emerges, don't just add it to the existing ad set — create a dedicated ad set with copy written specifically for that audience
- Combine `age_gender` and `country` breakdowns: "Women 35–44 in Australia" might be your true sweet spot

---

### 11.5 Placement Intelligence: Your Creative Might Be Working — Just Not Everywhere

**Scenario:** An ad campaign has a blended 0.6% CTR — seemingly mediocre. But before writing off the creative, check whether that number is the average of one placement performing brilliantly and another dragging it down.

**Claude prompts:**

```
Break down campaign 120210007654321 by placement for the last 10 days.
I want to see CTR, CPC, and spend per placement.
```

```
Is our creative working better on Instagram versus Facebook? Show me the placement
breakdown and tell me which placements I should keep and which to cut.
```

**Tools called:**
- `meta_get_breakdown_insights` with `breakdown: placement`, `campaign_id`

**Typical placement pattern for different creative formats:**

| Creative Format | Usually Performs Best | Usually Performs Worst |
|---|---|---|
| Short vertical video (9:16) | Instagram Reels, Facebook Reels, Stories | Desktop right column, Marketplace |
| Square image (1:1) with text overlay | Facebook Feed, Instagram Feed | Audience Network |
| Carousel | Facebook Feed, Instagram Feed | Stories (format mismatch) |
| Long-form video (60s+) | Facebook in-stream video | All mobile placements |

**Acting on placement data:**

```
Our Instagram Reels placement has 2.4% CTR but Facebook Right Column is at 0.1%.
Duplicate ad set 23856790012345 and restrict it to Instagram only —
publisher_platforms: instagram, instagram_positions: [reels, stream, story].
```

**Tools called:**
1. `meta_duplicate_adset` — clone the ad set
2. `meta_update_adset` with `targeting.placements` — restrict to the winning placements
3. `meta_bulk_update_status` — pause the underperforming original

**Tips:**
- Advantage+ placements (the default) optimizes across placements automatically — but this analysis is useful when you have a specific format that only works in certain environments
- A creative designed for Reels (vertical, fast-paced, subtitled) will always underperform on Desktop Feed where users have more attention — these need separate creatives, not just placement restrictions
- `meta_get_ad_preview` with different `ad_format` values lets you visually verify how a creative renders before restricting placement

---

### 11.6 Time-of-Day & Day-of-Week Patterns: When Is Your Audience Actually Buying?

**Scenario:** You have a campaign running 24/7 at the same bid. But your product (e.g., a B2B SaaS tool, a food delivery service, or a weekend experience) has a natural purchase window. You want to identify peak engagement hours and schedule spend accordingly.

**Claude prompts:**

```
Show me a daily breakdown of our campaign 120210008888888 over the last 30 days.
I want to see which days of the week have the best CTR and lowest CPA.
```

```
Pull a daily time series for campaign 120210008888888 — I want to see spend,
clicks, and conversions day by day so I can spot any weekday/weekend patterns.
```

**Tools called:**
- `meta_get_breakdown_insights` with `time_series: daily`, `campaign_id` — returns day-by-day performance rows

**Common patterns and what to do with them:**

| Pattern | What It Reveals | Action |
|---|---|---|
| CTR peaks Tuesday–Thursday, drops Friday–Sunday | B2B audience — they browse at work | Add dayparting: run ads Mon–Fri 8am–6pm only |
| Conversions spike Sunday evening | Weekend consideration → Sunday intent | Increase bids for Sunday afternoon, reduce Monday morning |
| CPAs are 40% lower on days with high CTR | Creative fatigue is periodic, not linear | Pause on low days, use saved budget to increase bids on peak days |
| Consistent performance across all days | Evergreen product with no purchase window | Don't daypart — you'll lose reach for no gain |

**Setting up dayparting:**

```
Update ad set 23856790056789 to only run Monday through Friday,
8am to 8pm in the account timezone. Add dayparting schedule for those hours.
```

**Tools called:**
- `meta_update_adset` with `ad_schedule: [{ days: [1,2,3,4,5], start_minute: 480, end_minute: 1200 }]`

> Note: `days` uses 0=Sunday through 6=Saturday. `start_minute` and `end_minute` are minutes from midnight. Dayparting requires a **lifetime budget** on the ad set.

**Tips:**
- Use at least 14 days of data before implementing dayparting — weekly variance can mislead you with a shorter window
- For e-commerce, Sunday evening 6–10pm is often the highest-intent window in English-speaking markets; for B2B, Tuesday–Wednesday 10am–2pm
- Dayparting doesn't eliminate spend on off-hours; it pauses the ad set during those windows — combine with a modest lifetime budget increase to compensate for the restricted delivery window

---

### 11.7 Frequency & Audience Exhaustion: When the Ad Isn't the Problem

**Scenario:** Your campaign ran well for two weeks and then CTR started declining steadily. Before changing the creative, check whether the audience has simply seen the ad too many times — the symptom looks identical but the fix is completely different.

**Claude prompts:**

```
Show me a daily time series for campaign 120210006543210 over the last 21 days.
I want CTR and frequency per day so I can see if declining performance correlates
with rising frequency.
```

```
What's the current frequency on our retargeting campaign? And how does CTR
compare between the first week and the last 7 days?
```

**Tools called:**
1. `meta_get_breakdown_insights` with `time_series: daily`, `campaign_id` — `frequency` and `ctr` per day
2. `meta_get_insights` with `time_range: last_7d` vs `time_range: last_14d` — compare periods manually

**Reading the frequency–CTR relationship:**

| Frequency | Typical Effect | Recommended Action |
|---|---|---|
| 1.0–2.0 | CTR usually stable or rising (novelty) | Normal — keep running |
| 2.0–3.5 | Slight CTR decline is normal | Acceptable — monitor weekly |
| 3.5–5.0 | CTR drops 20–40%, CPA rises | Refresh creative OR expand audience |
| 5.0+ | Severe CTR degradation | Pause and replace — audience is saturated |

**Diagnosing frequency vs creative fatigue:**
- **Frequency is rising AND CTR is falling** → audience exhaustion. Fix: expand targeting, build a lookalike from engagers, or add new audience segments.
- **Frequency is stable AND CTR is falling** → creative fatigue. Fix: new images, new copy angles, test DCO.
- **Frequency is stable AND CTR is stable** → neither. Look elsewhere (landing page, checkout, product-market fit).

**Acting on audience exhaustion:**

```
Our retargeting audience has frequency 6.2 and CTR has dropped from 2.1% to 0.4%.
The audience is exhausted. Build a lookalike from the people who engaged with
our page in the last 30 days, estimate the size for US, then launch the same
creative to the lookalike at $40/day.
```

**Tools called:**
1. `meta_create_engagement_audience` — build seed from page engagers
2. `meta_create_lookalike_audience` — 1% lookalike from the engagement seed
3. `meta_predict_reach` — confirm the lookalike is large enough
4. `meta_deploy_campaign` — launch existing creative to the new audience

**Tips:**
- Retargeting audiences (website visitors, video viewers) exhaust faster than cold audiences because they're smaller by definition — cap frequency at 3 for retargeting, 5 for prospecting
- `meta_estimate_audience_size` on your current ad set targeting will show you if the audience is too small (under 50,000) — small audiences always exhaust fast regardless of creative quality
- When you refresh creative on an exhausted audience, reset the frequency counter mentally — the new creative starts fresh even to people who saw the old one

---

### 11.8 Building the Next Iteration: From Signals to a Systematic DCO Test

**Scenario:** After running the analyses above, you've found your signals: one demographic segment outperforms, two placement types dominate, one video hook drives high completion, and one headline drives outbound clicks. Now systematically test the best combinations in a single DCO campaign rather than guessing.

**Claude prompts:**

```
Based on what we've found: the "social proof" angle image has the best outbound CTR,
but we haven't tested it with 3 different headlines. Upload image /path/to/social_proof.jpg
and deploy a DCO campaign testing these 3 headlines:
  1. "Join 14,000 customers who switched"
  2. "The only supplement backed by 3 clinical studies"
  3. "Results in 30 days or your money back"
And 2 body texts:
  1. "Stop wasting money on products that don't work."
  2. "Finally, a formula that actually delivers."
Target: US women 35-50, $60/day, paused to start.
```

**Tools called:**
1. `meta_upload_image` — upload the winning creative
2. `meta_deploy_dco_campaign` with `image_hashes: [hash]`, `headlines: [3 options]`, `bodies: [2 options]`, `start_immediately: false`

**Why DCO is the right tool here:**
Meta will test all 3 × 2 = 6 combinations and automatically weight delivery toward whichever combination generates the best results for your optimization goal — without you manually creating 6 separate ads and splitting budget.

**Reading DCO results after 7 days:**

```
Show me creative performance for campaign 120210001112222 broken down by ad.
I want to see which headline + body combination is winning on outbound CTR.
```

**Tools called:**
- `meta_get_insights` with `level: ad`, `campaign_id` — each DCO combination surfaces as a separate row
- `meta_get_creative_details` on the top-performing ad — extract the exact winning combination for future use

**The full iteration loop:**

```
Campaign → No conversions → Funnel audit (pixel events) → Creative scoring (CTR/outbound)
→ Video analysis (completion rate) → Demographic breakdown → Placement breakdown
→ Frequency check → Build DCO from winners → Let Meta pick the best combination
→ Scale the winner
```

**Tips:**
- DCO requires a minimum of ~5,000 impressions per combination to produce reliable results — set budget high enough to get there within 7 days
- Once a DCO winner emerges, extract the winning creative spec using `meta_get_creative_details` and use it in a standard ad set where you have more control over budget and targeting
- Keep each DCO test focused on one variable at a time: either images OR headlines, not both simultaneously, if you want clean signal

---

| Task | Primary Tool(s) |
|---|---|
| "How are my ads doing?" | `meta_account_intelligence` |
| Check a specific campaign | `meta_get_insights`, `meta_get_campaign` |
| See breakdowns by age/gender/country | `meta_get_breakdown_insights` |
| Why is an ad not delivering? | `meta_debug_ad` |
| No purchases — find where funnel drops off | `meta_get_insights` (level: ad, check `conversion_breakdown`) |
| Rank creatives by engagement before conversions | `meta_get_insights` (level: ad, sort by `outbound_clicks`) |
| Analyse video hook performance | `meta_get_insights` (level: ad, `video.completion_rate`) |
| Find unexpected high-performing demographics | `meta_get_breakdown_insights` (breakdown: age_gender, country) |
| Identify best-performing placements | `meta_get_breakdown_insights` (breakdown: placement) |
| Spot day-of-week/time-of-day patterns | `meta_get_breakdown_insights` (time_series: daily) |
| Diagnose frequency/audience exhaustion | `meta_get_breakdown_insights` (time_series: daily, check frequency) |
| Systematically test winning creative combinations | `meta_deploy_dco_campaign` |
| Launch a new campaign | `meta_upload_image` then `meta_deploy_campaign` |
| Add a creative variant | `meta_add_ad` |
| Duplicate a campaign | `meta_duplicate_campaign` |
| Run a scientific A/B test | `meta_create_ab_test` |
| Build a website retargeting audience | `meta_create_custom_audience` |
| Build a lookalike audience | `meta_create_lookalike_audience` |
| Page/IG engagement audience | `meta_create_engagement_audience` |
| Video view retargeting | `meta_create_video_audience` |
| Estimate reach before launch | `meta_predict_reach` |
| Pause multiple campaigns at once | `meta_bulk_update_status` |
| Check billing and remaining budget | `meta_get_account_billing` |
| Get Meta's optimization suggestions | `meta_get_recommendations` |
| Send a CAPI server-side event | `meta_send_conversions_event` |
| Browse product catalog | `meta_list_product_catalogs`, `meta_list_catalog_products` |
| Create a lead gen form | `meta_create_lead_form` |
| Declare a regulated ad category | `meta_deploy_campaign` with `special_ad_categories` |
| Research competitor ads | `meta_search_ads_library` |
| Preview an ad creative | `meta_get_ad_preview` |
| Inspect ad/adset/creative details | `meta_get_ad_details`, `meta_get_adset_details`, `meta_get_creative_details` |
| List available pixels | `meta_list_pixels` |
| List Facebook Pages | `meta_list_pages` |

---

## 12. Value Rules — Advanced Bid Adjustment

> **Optional feature.** Value Rules are not used by default. Claude will only call these tools when you explicitly ask. Before enabling Value Rules, read Meta's caveat: *overall CPA may increase* because you are constraining the auction. They are best suited for businesses with genuine differences in customer lifetime value across segments.

**Background:** Value Rules tell Meta's auction algorithm how much a conversion from a specific audience segment is worth to your business. Unlike Automated Rules (which pause or scale campaigns *after* the fact), Value Rules act *during* the auction — Meta adjusts your effective bid in real time so you win more impressions from high-value users and fewer from low-value ones.

---

### 12.1 Boost Bids for High-LTV Platforms (iOS vs Android)

**Scenario:** Your data shows iOS customers have a 2× higher 90-day LTV than Android customers. You want Meta to bid more aggressively for iOS impressions without running separate campaigns.

**Prompts:**
- *"List any existing value rules on the account first."*
- *"Create a value rule that boosts bids by 80% for iOS users, priority 1."*
- *"Create a second rule that reduces bids by 30% for Android users, priority 2."*

**Tools used:** `meta_list_value_rules` → `meta_create_value_rule` (×2)

**Example conditions:**
```
Condition: user_os i_contains [IOS]   → multiplier: 1.8
Condition: user_os i_contains [ANDROID] → multiplier: 0.7
```

**What Claude does:** Creates two rules at the account level. iOS users bid at 1.8× the base, Android at 0.7×. The rules evaluate in priority order — if a user matches rule 1, rule 2 is skipped.

---

### 12.2 Increase Bids for Top Geographic Markets

**Scenario:** You sell luxury goods and customers from New York, Los Angeles, and San Francisco convert at 3× the rate of other US cities. You want Meta to allocate more budget to those markets.

**Prompts:**
- *"Create a value rule that increases bids by 50% for users in New York, Los Angeles, and San Francisco."*
- *"Show me my current value rules and their priorities."*

**Tools used:** `meta_search_geo_locations` → `meta_create_value_rule` → `meta_list_value_rules`

**Note:** Use `meta_search_geo_locations` first with `location_types: ["city"]` to get the exact city keys Meta requires for the conditions array.

---

### 12.3 Suppress Low-Value Placements at the Bid Level

**Scenario:** Audience Network placements have a 4× higher CPA than Facebook Feed. Rather than excluding Audience Network entirely (which reduces reach), you want to keep it active but bid less.

**Prompts:**
- *"Create a value rule that reduces bids by 40% for Audience Network placements."*

**Tools used:** `meta_create_value_rule`

**Example condition:**
```
Condition: publisher_platform i_contains [audience_network] → multiplier: 0.6
```

**Why use this instead of placement exclusion?** Excluding a placement entirely can hurt delivery and increase CPMs on remaining placements. A bid reduction keeps reach available while limiting overspend.

---

### 12.4 Age-Based Bid Adjustment for Subscription Products

**Scenario:** Your analytics show that 35–54 year olds have a 60% higher subscription retention rate than 18–24 year olds. You want Meta to prioritize the higher-retention cohort.

**Prompts:**
- *"Create a value rule: boost bids by 60% for users aged 35–44 and 45–54, priority 1."*
- *"Create another rule: reduce bids by 25% for users aged 18–24, priority 2."*

**Tools used:** `meta_create_value_rule` (×2)

**Example conditions:**
```
Rule 1: age i_contains [35-44, 45-54] → multiplier: 1.6, priority: 1
Rule 2: age i_contains [18-24]        → multiplier: 0.75, priority: 2
```

---

### 12.5 Campaign-Specific Rule (Isolate Impact)

**Scenario:** You want to test Value Rules on one campaign before rolling out account-wide.

**Prompts:**
- *"Apply a value rule only to campaign [ID] — boost iOS users by 40%."*

**Tools used:** `meta_list_campaigns` → `meta_create_value_rule` (with `campaign_id`)

**What Claude does:** Creates the rule scoped to the specific campaign rather than the account, so other campaigns are unaffected. Useful for A/B validating the impact before wider deployment.

---

### 12.6 Review, Adjust, and Clean Up Rules

**Scenario:** After running Value Rules for 30 days you want to review performance and update or remove underperforming rules.

**Prompts:**
- *"List all my value rules."*
- *"Update rule [ID] — change the multiplier from 1.8 to 1.5."*
- *"Disable the Android suppression rule for now without deleting it."*
- *"Delete the old Audience Network rule — I'm going to use placement exclusions instead."*

**Tools used:** `meta_list_value_rules` → `meta_update_value_rule` → `meta_delete_value_rule`

**Tip:** Always list rules before creating new ones to avoid duplicate or conflicting rules. Priority order matters — the first matching rule wins, others are skipped.

---

### Value Rules Quick Reference

| Goal | Condition field | Example values | Suggested multiplier |
|---|---|---|---|
| Boost iOS users | `user_os` | `["IOS"]` | 1.5–2.0 |
| Suppress Android | `user_os` | `["ANDROID"]` | 0.6–0.8 |
| Top-market boost | `country` | `["US","GB","AU"]` | 1.3–1.8 |
| Suppress low-value country | `country` | `["XX"]` | 0.5–0.7 |
| High-LTV age band | `age` | `["35-44","45-54"]` | 1.4–1.8 |
| Suppress low-LTV age | `age` | `["18-24"]` | 0.6–0.8 |
| High-value placement | `publisher_platform` | `["facebook"]` | 1.2–1.5 |
| Suppress low-quality placement | `publisher_platform` | `["audience_network"]` | 0.5–0.7 |
| Reels-specific boost | `placement` | `["reels"]` | 1.2–1.5 |
| Female audience premium | `gender` | `["2"]` | 1.3–1.6 |

---

## 13. High Demand Periods — Scheduled Budget Boosts

> **Optional feature.** High Demand Period budget schedules are not used by default. Claude will only call these tools when you explicitly ask. Requires **Campaign Budget Optimization (CBO)** to be enabled on the campaign.

**Background:** High Demand Periods let you pre-schedule an automatic budget boost for a specific time window. Instead of waking up at midnight to manually increase your Black Friday budget, you set it once and Meta handles the rest — activating the boost on schedule and reverting to the normal budget when the period ends. Up to 50 schedules per campaign, no overlaps, minimum 3 hours per period.

**Two budget modes:**
- **MULTIPLIER** — scale your existing daily budget by a factor (e.g. `2.0` = double it). Simpler because you don't need to know the exact amount.
- **ABSOLUTE** — set an explicit spend cap in account currency cents (e.g. `15000` = $150). More precise, but cannot exceed 8× the daily budget.

---

### 13.1 Black Friday / Cyber Monday Budget Boost

**Scenario:** Your campaign runs at $100/day normally. For BFCM weekend you want to triple the budget from Friday midnight through Monday midnight, then return to normal automatically.

**Prompts:**
- *"List the budget schedules on campaign [ID]."*
- *"Create a budget schedule on campaign [ID]: multiply the budget by 3× from Friday November 28 00:00 UTC to Monday December 1 00:00 UTC."*

**Tools used:** `meta_list_budget_schedules` → `meta_create_budget_schedule`

**What Claude does:** Converts the human dates to Unix timestamps, validates the 72-hour window exceeds the 3-hour minimum, and creates the schedule. The campaign continues at $100/day until Friday, then automatically runs at $300/day for the weekend.

---

### 13.2 Flash Sale — 24-Hour Absolute Budget Cap

**Scenario:** You're running a 24-hour flash sale on Saturday and want to push exactly $500 in spend that day regardless of the normal daily budget.

**Prompts:**
- *"Schedule an absolute $500 budget for campaign [ID] on Saturday from 00:00 to 23:59 UTC."*

**Tools used:** `meta_create_budget_schedule`

**Note:** ABSOLUTE budgets are in account currency cents. $500 = `50000`. Must be ≤ 8× the campaign's daily budget.

---

### 13.3 Product Launch Day

**Scenario:** New product drops at 9am on March 15. You want a 2× budget boost from 6am (pre-launch awareness) through midnight to capture launch-day demand.

**Prompts:**
- *"Create a budget schedule for campaign [ID]: 2× multiplier on March 15 from 06:00 to 23:59 in my timezone (EST)."*

**Tools used:** `meta_create_budget_schedule`

**Tip:** Tell Claude your timezone when specifying times — it will convert to UTC Unix timestamps automatically.

---

### 13.4 Weekend Boost for Seasonal Campaigns

**Scenario:** Your data shows Saturday–Sunday outperform weekdays by 40%. You want a recurring pattern of weekend boosts across a 4-week campaign.

**Prompts:**
- *"List the budget schedules for campaign [ID] — I want to see what's already set up."*
- *"Create four weekend budget schedules on campaign [ID]: 1.5× multiplier for each Saturday 00:00 to Sunday 23:59 over the next 4 weekends."*

**Tools used:** `meta_list_budget_schedules` → `meta_create_budget_schedule` (×4)

**What Claude does:** Calculates the Unix timestamps for each of the four weekends and creates four separate non-overlapping schedules in sequence.

---

### 13.5 Cancel a Scheduled Boost

**Scenario:** You created a Black Friday schedule but the sale has been cancelled. You need to remove the boost before it activates.

**Prompts:**
- *"List the budget schedules for campaign [ID]."*
- *"Delete the Black Friday schedule."*

**Tools used:** `meta_list_budget_schedules` → `meta_delete_budget_schedule`

**What Claude does:** Lists schedules so you can identify the right ID, then deletes it. If the period is already active, the budget reverts to normal immediately.

---

### High Demand Period Quick Reference

| Scenario | budget_value_type | Example value | Notes |
|---|---|---|---|
| Double budget for an event | `MULTIPLIER` | `2.0` | 2× current daily budget |
| +50% weekend boost | `MULTIPLIER` | `1.5` | 50% increase |
| 3× for BFCM | `MULTIPLIER` | `3.0` | Triple spend for the weekend |
| Fixed $200 spend cap | `ABSOLUTE` | `20000` | Value in cents; max 8× daily |
| Fixed $500 for flash sale | `ABSOLUTE` | `50000` | Value in cents |
| Slight increase (+20%) | `MULTIPLIER` | `1.2` | Conservative boost |

**Constraints reminder:**
- CBO campaigns only
- Min 3 hours per period
- ABSOLUTE max = 8× daily budget
- Max 50 schedules per campaign, no overlaps

---

---

## 14. Creative Intelligence & The Campaign Iteration Loop

*Requires `GEMINI_API_KEY` in the meta-mcp-server environment. Works best when paired with image-gen-mcp.*

The creative intelligence tools form a closed feedback loop: analyse what's working → generate a data-driven brief → produce copy and creative → deploy → analyse again. Claude orchestrates the entire sequence.

---

### 14.1 Generate Ad Copy from Scratch

**Scenario:** You have a new product and need Meta-ready copy without writing it yourself.

**Claude prompts:**
```
Generate 3 ad copy variants for our project management SaaS. Target marketing managers.
Use a stat hook. We need leads.
```

```
Write DCO-ready copy for our summer sale. 5 variants, benefit hook, warm and direct brand voice.
```

**Tools called:**
- `meta_generate_ad_copy` — returns variants with character counts, `body_truncated_preview` (what shows before "See more"), and a `dco_ready` object with headline/body arrays ready to pass to `meta_deploy_dco_campaign`

**Example output:**
```json
{
  "variants": [{
    "headline": "Cut Reporting Time by 80%",
    "headline_chars": 24,
    "body": "Marketing managers save 6 hours/week with automated dashboards. 14-day free trial.",
    "body_chars": 82,
    "call_to_action": "START_TRIAL",
    "hook_used": "stat"
  }],
  "dco_ready": {
    "headlines": ["Cut Reporting Time by 80%", "..."],
    "bodies": ["Marketing managers save 6 hours/week...", "..."]
  }
}
```

**Tips:**
- `variants: 3–5` gives you DCO-ready material in one call
- Character counts flag headlines that will be truncated before you upload anything
- Hook frameworks: `question`, `stat`, `before_after`, `fomo`, `benefit`, `pattern_interrupt`

---

### 14.2 Generate a Creative Brief from Account Data

**Scenario:** You've been running campaigns for a month. You want a data-driven brief for what to test next — not a gut guess.

**Claude prompts:**
```
Pull last 30 days of account data and generate a creative brief for what to test next.
```

```
Generate a creative brief based on our account performance. Focus on what's working and what's fatiguing.
```

**Tools called:**
1. `meta_account_intelligence` — generates period-over-period summary with top and bottom performers
2. `meta_generate_creative_brief` (signal_type: `from_analytics`) — Gemini analyses the intelligence output and produces a structured brief

**Returns:** Brief with `hook_style`, `visual_direction`, `copy_direction`, `formats`, `reasoning`, `next_step`.

---

### 14.3 Generate a Competitor Brief

**Scenario:** A new competitor is running heavily. You want to understand their creative strategy and find the gap in their messaging.

**Claude prompts:**
```
Search the Ads Library for [competitor brand], then generate a creative brief based on the gap in their messaging.
```

```
What creative angles is [brand] NOT using? Build a brief around the gap.
```

**Tools called:**
1. `meta_search_ad_library` — searches `/ads_archive`, normalises results with run duration signals
2. `meta_generate_creative_brief` (signal_type: `from_competitor`) — identifies gaps and recommends angles to exploit

**What Claude does:**
- Identifies which ads have been running longest (spend proxy = `long_runner_likely_profitable`)
- Spots repeated patterns (the angles the competitor keeps going back to)
- Recommends angles they're NOT covering — the white space in the market

---

### 14.4 Close the Loop — Analyse Creative Performance

**Scenario:** A campaign has been running 7+ days. You want to know what won, what failed, and exactly what to test next.

**Claude prompts:**
```
Analyse creative performance for campaign 120215... and tell me what to test next.
```

```
Which creative won in campaign [ID]? Give me the brief for the next iteration.
```

**Tools called:**
1. `meta_analyze_creative_performance` — fetches ad-level insights, ranks by primary metric, passes to Gemini for synthesis
2. Gemini returns: winner hypothesis, loser diagnosis, `next_brief`
3. *(Optional)* `meta_generate_creative_brief` with `next_brief` → triggers the next iteration

**Example synthesis output:**
```json
{
  "winner": {
    "ad_name": "Before-After Hook v2",
    "hypothesis": "The 'before' pain state resonated strongly — copy opened with the problem, not the solution. The 4:5 format captured more feed real estate on mobile."
  },
  "losers": [{
    "ad_name": "Feature List v1",
    "diagnosis": "Feature-led copy without emotional hook. Low scroll-stop rate.",
    "action": "pause"
  }],
  "learning": "Pain-first hooks outperform feature lists 2:1 for this audience.",
  "confidence": "high",
  "next_brief": {
    "angle": "Deepen the pain-first hook with a specific time cost",
    "hook_style": "before_after",
    "formats": ["4:5", "9:16"]
  }
}
```

---

### 14.5 Full Autonomous Creative Loop

**Scenario:** You want to run the entire creative pipeline — from signal to live DCO campaign — in one conversation.

**Full conversation with Claude:**

```
1. "Pull last 30 days of account data and generate a creative brief."
   → meta_account_intelligence → meta_generate_creative_brief

2. "Generate 3 ad copy variants from the brief, stat hook, 3 DCO variants."
   → meta_generate_ad_copy (variants: 3, hook_style: stat)

3. "Generate 2 image variations for the brief — 4:5 format, warm tones."
   → imagen_generate_ad (image-gen-mcp, aspect_ratio: "4:5", count: 2)

4. "Add our product screenshot to the first image."
   → imagen_composite_asset (image-gen-mcp)

5. "Upload both images and launch a DCO campaign with the copy variants."
   → meta_upload_image × 2
   → meta_deploy_dco_campaign (image_hashes, dco_ready.headlines, dco_ready.bodies)

--- 7 days later ---

6. "Analyse performance on campaign [ID] and give me the next brief."
   → meta_analyze_creative_performance
   → synthesis.next_brief → back to step 2
```

**What this loop produces over time:**
- Week 1: Baseline — test 3 angles from account data
- Week 2: Scale the winner, pause losers, test winner variant
- Week 3: Iterate on the variant, introduce new hook from competitor brief
- Result: A self-improving creative system driven by real performance data

---

## 15. UGC Video Ad Pipeline

Generate data-driven UGC-style video ads using account performance signals. This section covers workflows that connect Meta campaign analytics to the [`ugc-pipeline`](https://github.com/adynami/ugc-pipeline) — an AI video factory that produces 30-second vertical ads in cinematic and talking-head modes.

**Prerequisites:**
- `ugc-pipeline` cloned and configured locally (`FAL_KEY`, `ELEVENLABS_API_KEY`, etc.)
- The workflows below produce a JSON angle config that feeds directly into `python generate.py`

---

### 15.1 Generate a UGC Angle from Account Performance Data

**Scenario:** Your top-of-funnel campaigns have been running for 30 days. You want to generate a new UGC video angle grounded in what the data says is resonating — not guesswork.

**Conversation with Claude:**

```
"Pull the last 30 days of account performance broken down by age and gender.
Identify the highest-CTR demographic and the ad copy that drove the most
link clicks. Then generate a creative brief for a new UGC video angle
targeting that audience."
```

**Tools used:**
1. `meta_get_breakdown_insights` (age, gender breakdown)
2. `meta_get_ad_insights` (ad-level CTR, link clicks)
3. `meta_generate_creative_brief` (signal_type: from_analytics)

**Output — brief fed to ugc-pipeline:**

```json
{
  "product": "walking rewards app",
  "objective": "OUTCOME_LEADS",
  "audience": "Women 35–54, engaged with fitness/wellness content",
  "angle": "The embarrassment that finally made her move — paid to do it",
  "hook_style": "before_after",
  "visual_direction": "close-up podcast talking-head, desaturated → warm progression",
  "copy_direction": "lead with specific visceral moment, not generic health claim",
  "key_benefits": ["15 minutes walking", "earn rewards", "no gym required"],
  "formats": ["9:16", "4:5"],
  "variants_to_test": 3
}
```

**Generate the video:**
```bash
python generate.py --generate-angle
# or feed the brief directly by editing configs/angles/new_angle.json
python generate.py configs/angles/new_angle.json --mode cinematic
```

---

### 15.2 Identify a Hook Gap from Competitor Ads, Then Film It

**Scenario:** You want to find an emotional hook angle that competitors aren't using, then generate a UGC ad around it.

**Conversation with Claude:**

```
"Search the Ad Library for [competitor/category] ads that have been
running more than 30 days. Identify which hook styles they're using most
heavily and find a gap — an angle they're NOT running. Generate a UGC
creative brief for that gap angle."
```

**Tools used:**
1. `meta_search_ad_library` (search_terms, active_only: true, limit: 30)
2. `meta_generate_creative_brief` (signal_type: from_competitor)

**What the brief captures:**

The brief will note which hooks competitors are saturating (e.g., "stat" and "benefit" hooks dominate competitor ads) and recommend the gap (e.g., "pattern_interrupt" or "before_after" hooks are underused). The visual direction and copy direction will explicitly address the white space.

**Generate the video:**
```bash
python generate.py configs/angles/competitor_gap_angle.json --mode cinematic
# 9:16 and 4:5 variants auto-exported
```

---

### 15.3 Performance → Next UGC Angle (Closing the Loop)

**Scenario:** Your current UGC cinematic ad has been live for 7 days. You want to analyze what worked, then generate the next iteration as a new angle config.

**Conversation with Claude:**

```
"Analyze creative performance on campaign [ID] over the last 7 days.
Tell me which ad won, why it won, and what the next UGC angle should be.
Format the output as a ugc-pipeline JSON config I can run directly."
```

**Tools used:**
1. `meta_analyze_creative_performance` (campaign_id, time_range: last_7d)

**Expected output:**

```json
{
  "winner": {
    "ad_name": "Hook — airplane seatbelt",
    "hypothesis": "Specific physical embarrassment hook outperformed generic health claim by 2.3× CTR. Short scene 1 under 10 words drove higher scroll-stop rate."
  },
  "learning": "Visceral specificity beats benefit statements for this audience",
  "next_brief": {
    "angle": "A different specific shame moment — scaled to the next trigger",
    "hook_style": "pattern_interrupt",
    "variants_to_test": 3
  }
}
```

**Generate the next iteration:**
```bash
# Save next_brief as a new angle config, then run
python generate.py configs/angles/iteration_2.json --mode cinematic --captions
```

---

### 15.4 Talking-Head Ad from Performance Data

**Scenario:** Analytics show your best-performing audience responds to personal testimony. You want to generate a talking-head style UGC ad (avatar + B-roll) for a specific demographic segment.

**Conversation with Claude:**

```
"Which age and placement combination had the best CPA last month?
Generate a creative brief for a talking-head UGC ad optimized for that
placement. Include visual and pacing notes appropriate for that format."
```

**Tools used:**
1. `meta_get_breakdown_insights` (age, placement breakdown, last_30d)
2. `meta_generate_creative_brief` (signal_type: from_analytics)

**Run talking-head pipeline:**
```bash
python generate.py configs/angles/testimony_angle.json \
  --mode talking_head \
  --avatar-id <heygen_avatar_id> \
  --voice-id <elevenlabs_voice_id> \
  --music assets/music/emotional.mp3 \
  --captions
# → output/final/testimony_angle_th_9x16.mp4
# → output/final/testimony_angle_th_4x5.mp4
```

The talking-head mode is particularly effective for the 35–54 female demographic when the avatar matches the target persona — it reads as authentic testimony rather than produced advertising.

---

### 15.5 Batch UGC Variants from Top Creative Signals

**Scenario:** You want to systematically scale your creative testing — pull the top 5 performing hook angles from the last 90 days and generate a full batch of UGC variants to test in parallel.

**Conversation with Claude:**

```
"Pull ad-level performance for the last 90 days. Identify the top 5
ads by CTR with at least 1000 impressions each. Extract the hook from
each ad's copy and generate 5 new UGC angle configs — one per hook,
with fresh dialogue — formatted for ugc-pipeline batch processing."
```

**Tools used:**
1. `meta_get_ad_insights` (last_90d, filtering by impressions ≥ 1000)
2. `meta_generate_creative_brief` × 5 (once per winning hook signal)
3. `meta_generate_ad_copy` × 5 (generate fresh dialogue for each angle)

**Batch generate all 5 angles:**
```bash
python batch.py --configs configs/angles/ --mode cinematic --workers 3
# Processes all 5 in parallel (3 concurrent)
# → output/batch/ with 9:16 and 4:5 variants for each
```

**What this produces:**
- 5 × 30-second cinematic videos
- 5 × 4:5 crop variants (10 files total)
- Each angle grounded in a real CTR signal from your account data — not guesswork

**Deploy as a DCO test once videos are ready:**
```
"Upload all 5 video variants and launch a DCO campaign to split-test them
against the 35-54 women audience, $50/day, OUTCOME_LEADS objective."
→ meta_upload_video × 5
→ meta_deploy_dco_campaign
```

---

### UGC Pipeline Quick Reference

| Goal | Meta MCP tools | ugc-pipeline command |
|---|---|---|
| Generate angle from account data | `meta_account_intelligence` → `meta_generate_creative_brief` | `python generate.py <config.json>` |
| Find competitor gap angle | `meta_search_ad_library` → `meta_generate_creative_brief` | `python generate.py <config.json>` |
| Iterate on a winning ad | `meta_analyze_creative_performance` | `python generate.py <config.json> --mode cinematic` |
| Talking-head for testimony angles | `meta_get_breakdown_insights` → `meta_generate_creative_brief` | `python generate.py <config.json> --mode talking_head` |
| Batch test 5 angles at once | `meta_get_ad_insights` × N → `meta_generate_ad_copy` × N | `python batch.py --configs configs/angles/` |
| Deploy finished videos | — | `meta_upload_video` → `meta_deploy_dco_campaign` |

---

## Tips for Working with Claude on Ad Tasks

**Be specific about numbers.** Instead of "increase the budget", say "increase the daily budget to $75/day". Claude will confirm before writing any changes.

**Mention time ranges explicitly.** "Last 30 days" is clearer than "recently" and maps directly to a tool parameter.

**Ask for analysis before action.** For optimization decisions, ask Claude to pull the data and summarize it first, then ask for the change as a follow-up. This gives you a chance to review before anything is modified.

**Use dry-run mode for testing.** Set `DRY_RUN=true` in your server configuration to simulate all write operations safely. Every tool call returns realistic-looking fake responses without touching the Meta API. See [dry-run.md](./dry-run.md).

**Watch for learning phase disruptions.** Pausing, duplicating, or significantly changing ad sets resets the learning phase. Claude will note when an action might trigger a reset, but it is worth keeping in mind before making bulk changes mid-week.

**Deduplication is your responsibility for CAPI.** If you are running both a browser pixel and CAPI, always pass matching `event_id` values to both. Claude will remind you, but the deduplication logic depends on your own code generating and passing consistent event IDs.
