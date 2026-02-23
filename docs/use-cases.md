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

## Quick Reference: Tool-to-Task Mapping

| Task | Primary Tool(s) |
|---|---|
| "How are my ads doing?" | `meta_account_intelligence` |
| Check a specific campaign | `meta_get_insights`, `meta_get_campaign` |
| See breakdowns by age/gender/country | `meta_get_breakdown_insights` |
| Why is an ad not delivering? | `meta_debug_ad` |
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

## Tips for Working with Claude on Ad Tasks

**Be specific about numbers.** Instead of "increase the budget", say "increase the daily budget to $75/day". Claude will confirm before writing any changes.

**Mention time ranges explicitly.** "Last 30 days" is clearer than "recently" and maps directly to a tool parameter.

**Ask for analysis before action.** For optimization decisions, ask Claude to pull the data and summarize it first, then ask for the change as a follow-up. This gives you a chance to review before anything is modified.

**Use dry-run mode for testing.** Set `DRY_RUN=true` in your server configuration to simulate all write operations safely. Every tool call returns realistic-looking fake responses without touching the Meta API. See [dry-run.md](./dry-run.md).

**Watch for learning phase disruptions.** Pausing, duplicating, or significantly changing ad sets resets the learning phase. Claude will note when an action might trigger a reset, but it is worth keeping in mind before making bulk changes mid-week.

**Deduplication is your responsibility for CAPI.** If you are running both a browser pixel and CAPI, always pass matching `event_id` values to both. Claude will remind you, but the deduplication logic depends on your own code generating and passing consistent event IDs.
