import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import {
  fetchCampaigns, fetchAdSets, fetchAds,
  fetchAccountInsights, fetchCampaignInsights,
  updateCampaignStatus as apiUpdateStatus,
  readCampaign, readAdSet, readAd as apiReadAd,
  getAccountContext, createAd, searchTargeting,
  searchTargetingExtended, searchGeoLocations, getInterestSuggestions,
  estimateAudienceSize, getCreativeDetails, downloadImageAsBase64,
  getAdDetails as apiGetAdDetails, getAdSetDetails as apiGetAdSetDetails,
  listPages, batchUpdateStatus,
} from '../meta-client.js';
import { buildTargetingSpec } from '../utils/targeting.js';
import { resolveRange, type TimeRangeKey } from '../utils/date-ranges.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';
import type { CampaignSummary, AdSetSummary, AdSummary, InsightsSummary } from '../utils/schemas.js';

// ── Tool definitions ──

export const managementTools = [
  {
    name: 'meta_list_campaigns',
    description: 'List campaigns in the Meta ad account. Returns name, status, objective, and budget for each. Use when the user wants to see what campaigns exist, check statuses, or find a campaign ID. Use status_filter to narrow results (e.g., only ACTIVE). Default limit is 5 to save tokens — increase if the user needs more.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max campaigns to return (default 5)' },
        status_filter: {
          type: 'array',
          items: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
          description: 'Only return campaigns with these statuses',
        },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'concise = name+status only, detailed = all fields (default: detailed)',
        },
      },
    },
  },
  {
    name: 'meta_get_campaign',
    description: 'Get details for a single campaign by its ID. Use when the user asks about a specific campaign or you need budget/objective/dates for one campaign. Returns budget, objective, bid strategy, and schedule.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Meta campaign ID (numeric string, e.g. "23851234567890")' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'meta_list_adsets',
    description: 'List ad sets in the account. Use when the user asks about targeting, budgets at the ad set level, or wants to drill into a campaign. Filter by campaign_id to see ad sets within a specific campaign.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Only show ad sets in this campaign' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 5)' },
        status_filter: {
          type: 'array',
          items: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
          description: 'Only return ad sets with these statuses',
        },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'concise = name+status only (default: detailed)',
        },
      },
    },
  },
  {
    name: 'meta_list_ads',
    description: 'List ads in the account. Use when the user wants to see individual ads or needs an ad ID for debugging. Filter by adset_id or campaign_id to narrow results.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'Only show ads in this ad set' },
        campaign_id: { type: 'string', description: 'Only show ads in this campaign' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'meta_get_insights',
    description: 'Get performance metrics for the account or a specific campaign. All key metrics are pre-calculated server-side: CTR, CPC, CPM, CPA, ROAS. Use when the user asks about performance, spend, or ROI. Set level to "campaign" to see per-campaign breakdown sorted by spend.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'custom'],
          description: 'Time period to analyze (default: last_7d). Use "custom" with since+until for arbitrary date ranges.',
        },
        since: { type: 'string', description: 'Start date in YYYY-MM-DD format. Required when time_range is "custom".' },
        until: { type: 'string', description: 'End date in YYYY-MM-DD format. Required when time_range is "custom".' },
        campaign_id: { type: 'string', description: 'Restrict insights to this campaign' },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Aggregation level (default: account). Use "campaign" for per-campaign breakdown.',
        },
        limit: { type: 'number', minimum: 1, maximum: 25, description: 'Max rows for non-account levels (default 5)' },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'concise = spend/conversions/roas only, detailed = all metrics (default: detailed)',
        },
      },
    },
  },
  {
    name: 'meta_update_campaign_status',
    description: 'Change a campaign status to ACTIVE, PAUSED, or ARCHIVED. Use when the user wants to pause, resume, or archive a campaign. This is a write operation — confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID to update' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], description: 'Target status' },
      },
      required: ['campaign_id', 'status'],
    },
  },
  {
    name: 'meta_get_account',
    description: 'Get ad account metadata: name, currency, timezone, and account status. Use when you need to know the currency for displaying budgets or to verify the connected account.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'meta_search_targeting',
    description: `Search for interest or behavior targeting options by keyword. Returns IDs and names you can use in the targeting spec of meta_deploy_campaign and meta_update_adset. Use when the user wants to target people interested in "fitness", "travel", "luxury goods", etc., or use specific behaviors like "frequent travelers" or "online shoppers".`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['interest', 'behavior'],
          description: 'interest = Facebook interest categories (hobbies, topics, pages). behavior = purchase behaviors, device usage, travel patterns, etc.',
        },
        query: { type: 'string', description: 'Keyword to search for (e.g. "fitness", "travel", "luxury", "small business")' },
      },
      required: ['type', 'query'],
    },
  },
  {
    name: 'meta_search_interests',
    description: `Search for Facebook interest targeting options by keyword. Returns IDs, names, and audience size estimates you can pass into targeting.interests when calling meta_deploy_campaign or meta_update_adset. Example: search "fitness" to find interests like "Fitness and wellness", "Gym", etc.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword to search (e.g. "yoga", "travel", "coffee")' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'meta_search_behaviors',
    description: `Search for behavior targeting options by keyword. Behaviors include purchase patterns, device usage, travel habits, and more. Returns IDs you can pass into targeting.behaviors when calling meta_deploy_campaign or meta_update_adset.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword to search (e.g. "frequent traveler", "online shopper")' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'meta_search_demographics',
    description: `Search for demographic targeting options such as life events, industries, income levels, device types, and more. Returns IDs for use in targeting.flexible_spec. Choose the class that matches your targeting need.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        class: {
          type: 'string',
          enum: ['life_events', 'industries', 'income', 'user_device', 'user_os', 'generation', 'household_composition', 'parents', 'politics', 'relationship_statuses', 'work_employers', 'work_positions'],
          description: 'Demographic category to search within',
        },
        query: { type: 'string', description: 'Keyword to filter within the class (optional — omit to browse)' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
      required: ['class'],
    },
  },
  {
    name: 'meta_search_geo_locations',
    description: `Search for geographic targeting options: countries, regions, cities, zip codes, and more. Returns keys to pass into targeting.geo_locations when calling meta_deploy_campaign or meta_update_adset. Use location_types to filter by type.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Location name to search (e.g. "Paris", "California", "90210")' },
        location_types: {
          type: 'array',
          items: { type: 'string', enum: ['country', 'region', 'city', 'zip', 'geo_market', 'electoral_district', 'country_group', 'place'] },
          description: 'Filter by location type (default: all types)',
        },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'meta_get_interest_suggestions',
    description: `Given one or more interest IDs, return related/similar interest suggestions from Meta. Useful for expanding a seed interest list. Returns IDs and names with audience size estimates.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        interest_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of interest IDs to expand from (get IDs from meta_search_interests)',
        },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max suggestions to return (default 25)' },
      },
      required: ['interest_ids'],
    },
  },
  {
    name: 'meta_estimate_audience_size',
    description: `Estimate the potential reach of a targeting configuration before spending money. Accepts the same targeting shape as meta_deploy_campaign. Returns lower/upper bound daily reach and monthly active users (MAU). Use before creating a campaign to validate audience size.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        targeting: {
          type: 'object',
          description: 'Targeting spec (same format as meta_deploy_campaign targeting parameter)',
          properties: {
            age_min: { type: 'number' },
            age_max: { type: 'number' },
            genders: { type: 'array', items: { type: 'number' } },
            geo_locations: {
              type: 'object',
              properties: { countries: { type: 'array', items: { type: 'string' } } },
            },
            interests: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] } },
            behaviors: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] } },
          },
          required: ['geo_locations'],
        },
        optimization_goal: {
          type: 'string',
          enum: ['IMPRESSIONS', 'REACH', 'LINK_CLICKS', 'CONVERSIONS', 'LANDING_PAGE_VIEWS', 'VIDEO_VIEWS', 'LEAD_GENERATION', 'QUALITY_LEAD'],
          description: 'Optimization goal (default: IMPRESSIONS)',
        },
      },
      required: ['targeting'],
    },
  },
  {
    name: 'meta_get_ad_image',
    description: `Fetch and display the creative image for an ad or creative inline in Claude. Provide either an ad_id or creative_id. Downloads the thumbnail and returns it as an image so you can see what the ad looks like without leaving the conversation.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'Ad ID to fetch the creative image for' },
        creative_id: { type: 'string', description: 'Creative ID to fetch the image for directly (faster if you already have it)' },
      },
    },
  },
  {
    name: 'meta_get_ad_details',
    description: 'Get full details for a single ad including its creative spec, status, bid, tracking, and parent IDs. Use when debugging an ad or inspecting its creative setup.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'Ad ID to fetch details for' },
      },
      required: ['ad_id'],
    },
  },
  {
    name: 'meta_get_adset_details',
    description: 'Get full details for a single ad set including targeting, budget, bid strategy, optimization goal, schedule, and promoted object. Use when you need the complete targeting spec or budget details for one ad set.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'Ad set ID to fetch details for' },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'meta_get_creative_details',
    description: 'Get the full creative spec for an ad creative by ID. Returns object_story_spec (page + link/video data), asset_feed_spec for DCO creatives, and thumbnail URL. Use to inspect or audit a creative without downloading the image.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        creative_id: { type: 'string', description: 'Creative ID to fetch' },
      },
      required: ['creative_id'],
    },
  },
  {
    name: 'meta_list_pages',
    description: 'List Facebook Pages that the connected access token has access to. Returns page ID, name, category, and follower count. Use to discover page IDs before creating lead forms, page-post ads, or engagement audiences.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max pages to return (default 25)' },
      },
    },
  },
  {
    name: 'meta_predict_reach',
    description: 'Predict the daily reach and impression curve for a targeting spec at a given budget. Returns estimated daily active users, MAU, and a spend/reach curve so you can see the trade-off before launching. Use before creating a campaign to validate audience size and budget efficiency.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        targeting: {
          type: 'object',
          description: 'Targeting spec (same format as meta_deploy_campaign targeting parameter)',
          properties: {
            age_min: { type: 'number' },
            age_max: { type: 'number' },
            genders: { type: 'array', items: { type: 'number' } },
            geo_locations: {
              type: 'object',
              properties: { countries: { type: 'array', items: { type: 'string' } } },
            },
            interests: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] } },
            behaviors: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] } },
          },
          required: ['geo_locations'],
        },
        daily_budget_usd: {
          type: 'number',
          description: 'Daily budget in USD to model reach at. Include to get the spend/reach efficiency curve. Omit for just the audience size estimate.',
        },
        optimization_goal: {
          type: 'string',
          enum: ['IMPRESSIONS', 'REACH', 'LINK_CLICKS', 'CONVERSIONS', 'LANDING_PAGE_VIEWS', 'VIDEO_VIEWS', 'LEAD_GENERATION'],
          description: 'Optimization goal (default: IMPRESSIONS)',
        },
      },
      required: ['targeting'],
    },
  },
  {
    name: 'meta_bulk_update_status',
    description: 'Update the status of multiple campaigns, ad sets, or ads in a single call. More efficient than calling meta_update_campaign_status one by one. This is a write operation — confirm the IDs and target status with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of campaign/adset/ad IDs to update',
          minItems: 1,
          maxItems: 50,
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'],
          description: 'Target status to set on all provided IDs',
        },
      },
      required: ['ids', 'status'],
    },
  },
  {
    name: 'meta_get_ad_preview',
    description: 'Generate a preview URL and iframe snippet for an ad in a given format. Use to visually review an ad before it goes live, or to share a preview with a client. Returns a shareable_link URL that can be opened in a browser.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'Ad ID to preview' },
        ad_format: {
          type: 'string',
          enum: ['DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD', 'MOBILE_FEED_BASIC', 'MOBILE_INTERSTITIAL', 'MOBILE_BANNER', 'MOBILE_MEDIUM_RECTANGLE', 'MOBILE_NATIVE', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'AUDIENCE_NETWORK_OUTSTREAM_VIDEO', 'MESSENGER_MOBILE_INBOX_MEDIA', 'FACEBOOK_STORY_MOBILE', 'MARKETPLACE_MOBILE'],
          description: 'Preview format (default: DESKTOP_FEED_STANDARD)',
        },
      },
      required: ['ad_id'],
    },
  },
  {
    name: 'meta_get_account_billing',
    description: 'Get billing and spend information for the ad account: total amount spent, remaining spend cap, current balance, and funding source. Use to check account health, remaining budget, or payment method before launching campaigns.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'meta_get_recommendations',
    description: 'Get Meta\'s automated optimization recommendations for the ad account. Returns suggestions like enabling Advantage+ audience, fixing rejected ads, increasing budgets on high-performing campaigns, or fixing delivery issues. Use when auditing the account or preparing optimization reports.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 25, description: 'Max recommendations to return (default 10)' },
      },
    },
  },
  {
    name: 'meta_add_ad',
    description: `Create a new ad inside an existing ad set. Use when adding additional ad variations (different images/copy) to an ad set that already exists — e.g., A/B testing creatives within one ad set. Requires an image_hash from meta_upload_image. For creating a full campaign from scratch, use meta_deploy_campaign instead.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'Existing ad set ID to add the ad to' },
        ad_name: { type: 'string', description: 'Display name for the ad' },
        image_hash: { type: 'string', description: 'Image hash from meta_upload_image' },
        page_id: { type: 'string', description: 'Facebook Page ID to run the ad from' },
        headline: { type: 'string', description: 'Ad headline (shown below image)' },
        body: { type: 'string', description: 'Primary text (shown above image)' },
        link_url: { type: 'string', description: 'Destination URL when ad is clicked' },
        call_to_action: {
          type: 'string',
          enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
          description: 'CTA button text (default: LEARN_MORE)',
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED'],
          description: 'Ad status (default: PAUSED)',
        },
      },
      required: ['adset_id', 'ad_name', 'image_hash', 'page_id', 'headline', 'body', 'link_url'],
    },
  },
];

// ── Handlers ──

export async function handleManagementTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_campaigns': return listCampaigns(args);
    case 'meta_get_campaign': return getCampaignDetails(args);
    case 'meta_list_adsets': return listAdSets(args);
    case 'meta_list_ads': return listAds(args);
    case 'meta_get_insights': return getInsights(args);
    case 'meta_update_campaign_status': return updateStatus(args);
    case 'meta_get_account': return getAccountContext();
    case 'meta_search_targeting': return handleSearchTargeting(args);
    case 'meta_add_ad': return addAd(args);
    case 'meta_search_interests': return handleSearchInterests(args);
    case 'meta_search_behaviors': return handleSearchBehaviors(args);
    case 'meta_search_demographics': return handleSearchDemographics(args);
    case 'meta_search_geo_locations': return handleSearchGeoLocations(args);
    case 'meta_get_interest_suggestions': return handleGetInterestSuggestions(args);
    case 'meta_estimate_audience_size': return handleEstimateAudienceSize(args);
    case 'meta_get_ad_image': return handleGetAdImage(args);
    case 'meta_get_ad_details': return getAdDetails(args);
    case 'meta_get_adset_details': return getAdSetDetails(args);
    case 'meta_get_creative_details': return handleGetCreativeDetails(args);
    case 'meta_list_pages': return handleListPages(args);
    case 'meta_predict_reach': return handlePredictReach(args);
    case 'meta_bulk_update_status': return handleBulkUpdateStatus(args);
    case 'meta_get_ad_preview': return handleGetAdPreview(args);
    case 'meta_get_account_billing': return handleGetAccountBilling();
    case 'meta_get_recommendations': return handleGetRecommendations(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function listCampaigns(args: any): Promise<any> {
  const limit = args.limit ?? 5;
  const concise = args.response_format === 'concise';
  const params: Record<string, any> = { limit: limit + 1 };

  if (args.status_filter?.length) {
    params.filtering = [{ field: 'effective_status', operator: 'IN', value: args.status_filter }];
  }
  if (args.after) params.after = args.after;

  const fields = ['id', 'name', 'status', 'effective_status', 'objective', 'daily_budget', 'lifetime_budget', 'buying_type'];
  const raw = await fetchCampaigns(fields, params);
  const hasMore = raw.length > limit;
  const items = raw.slice(0, limit);

  if (concise) {
    return {
      campaigns: items.map((c: any) => ({ id: c.id, name: c.name, status: c.effective_status ?? c.status })),
      has_more: hasMore,
    };
  }

  return {
    campaigns: items.map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.effective_status ?? c.status,
      objective: c.objective,
      daily_budget: c.daily_budget ? `${(parseInt(c.daily_budget) / 100).toFixed(2)}` : null,
      lifetime_budget: c.lifetime_budget ? `${(parseInt(c.lifetime_budget) / 100).toFixed(2)}` : null,
      buying_type: c.buying_type,
    })),
    has_more: hasMore,
  };
}

async function getCampaignDetails(args: any): Promise<any> {
  const fields = ['id', 'name', 'status', 'effective_status', 'objective', 'daily_budget', 'lifetime_budget', 'buying_type', 'bid_strategy', 'created_time', 'start_time', 'stop_time'];
  const c = await readCampaign(args.campaign_id, fields);

  return {
    id: c.id,
    name: c.name,
    status: c.effective_status ?? c.status,
    objective: c.objective,
    daily_budget: c.daily_budget ? `${(parseInt(c.daily_budget) / 100).toFixed(2)}` : null,
    lifetime_budget: c.lifetime_budget ? `${(parseInt(c.lifetime_budget) / 100).toFixed(2)}` : null,
    buying_type: c.buying_type,
    bid_strategy: c.bid_strategy,
    created: c.created_time,
    start_time: c.start_time,
    stop_time: c.stop_time,
  };
}

async function listAdSets(args: any): Promise<any> {
  const limit = args.limit ?? 5;
  const concise = args.response_format === 'concise';
  const params: Record<string, any> = { limit };
  if (args.campaign_id) {
    params.filtering = [{ field: 'campaign_id', operator: 'EQUAL', value: args.campaign_id }];
  }
  if (args.status_filter?.length) {
    params.filtering = [
      ...(params.filtering ?? []),
      { field: 'effective_status', operator: 'IN', value: args.status_filter },
    ];
  }

  const fields = ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'bid_strategy', 'optimization_goal', 'targeting'];
  const raw = await fetchAdSets(fields, params);

  if (concise) {
    return { adsets: raw.slice(0, limit).map((s: any) => ({ id: s.id, name: s.name, status: s.effective_status ?? s.status })) };
  }

  return {
    adsets: raw.slice(0, limit).map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.effective_status ?? s.status,
      daily_budget: s.daily_budget ? `${(parseInt(s.daily_budget) / 100).toFixed(2)}` : null,
      lifetime_budget: s.lifetime_budget ? `${(parseInt(s.lifetime_budget) / 100).toFixed(2)}` : null,
      bid_strategy: s.bid_strategy ?? null,
      optimization_goal: s.optimization_goal ?? null,
      targeting_summary: summarizeTargeting(s.targeting),
    })),
  };
}

function summarizeTargeting(t: any): string {
  if (!t) return 'No targeting data';
  const parts: string[] = [];
  if (t.age_min || t.age_max) parts.push(`Age ${t.age_min ?? '?'}-${t.age_max ?? '?'}`);
  if (t.geo_locations?.countries) parts.push(t.geo_locations.countries.join(', '));
  if (t.genders?.length) {
    const g = t.genders.map((n: number) => n === 1 ? 'M' : n === 2 ? 'F' : 'All');
    parts.push(g.join('/'));
  }
  return parts.join(' | ') || 'Broad';
}

async function listAds(args: any): Promise<any> {
  const limit = args.limit ?? 5;
  const params: Record<string, any> = { limit };
  const filtering: any[] = [];
  if (args.adset_id) filtering.push({ field: 'adset_id', operator: 'EQUAL', value: args.adset_id });
  if (args.campaign_id) filtering.push({ field: 'campaign_id', operator: 'EQUAL', value: args.campaign_id });
  if (filtering.length) params.filtering = filtering;

  const fields = ['id', 'name', 'status', 'effective_status'];
  const raw = await fetchAds(fields, params);

  return {
    ads: raw.slice(0, limit).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.effective_status ?? a.status,
    })),
  };
}

async function getInsights(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = rangeKey === 'custom'
    ? (() => {
        if (!args.since || !args.until) throw new Error('since and until are required when time_range is "custom"');
        return { since: args.since as string, until: args.until as string };
      })()
    : resolveRange(rangeKey);
  const level = args.level ?? 'account';
  const limit = args.limit ?? 5;
  const concise = args.response_format === 'concise';

  const params: Record<string, any> = { time_range: range, level };

  if (level !== 'account') {
    params.limit = limit;
    params.sort = ['spend_descending'];
  }

  let raw: any[];
  if (args.campaign_id && level === 'account') {
    raw = await fetchCampaignInsights(args.campaign_id, { time_range: range });
  } else {
    raw = await fetchAccountInsights(params);
  }

  if (!raw.length) {
    return concise
      ? { spend: 0, conversions: 0, roas: 0 }
      : { entity: 'Account', period: `${range.since} to ${range.until}`, spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, roas: 0, cpa: 0 };
  }

  const mapRow = (row: any) => {
    const m = computeMetrics(row as RawInsightRow);
    const name = row.campaign_name ?? row.adset_name ?? row.ad_name ?? 'Account';
    if (concise) {
      return { name, spend: m.spend, conversions: m.conversions, roas: m.roas, cpa: m.cpa };
    }
    return {
      name,
      period: `${row.date_start} to ${row.date_stop}`,
      spend: m.spend, impressions: m.impressions, clicks: m.clicks,
      ctr: m.ctr, cpc: m.cpc, cpm: m.cpm,
      conversions: m.conversions, conversion_value: m.conversion_value,
      roas: m.roas, cpa: m.cpa, frequency: m.frequency, reach: m.reach,
      ...(m.conversion_breakdown && { conversion_breakdown: m.conversion_breakdown }),
      ...(m.conversion_value_breakdown && { conversion_value_breakdown: m.conversion_value_breakdown }),
      ...(m.video && { video: m.video }),
      ...(m.quality_ranking && { quality_ranking: m.quality_ranking }),
      ...(m.engagement_rate_ranking && { engagement_rate_ranking: m.engagement_rate_ranking }),
      ...(m.conversion_rate_ranking && { conversion_rate_ranking: m.conversion_rate_ranking }),
    };
  };

  if (level === 'account') return mapRow(raw[0]);
  return raw.slice(0, limit).map(mapRow);
}

async function updateStatus(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated: Campaign ${args.campaign_id} -> ${args.status}` };
  }
  await apiUpdateStatus(args.campaign_id, args.status);
  return { success: true, campaign_id: args.campaign_id, new_status: args.status };
}

async function handleSearchTargeting(args: any): Promise<any> {
  const results = await searchTargeting(args.type, args.query);
  return {
    type: args.type,
    query: args.query,
    results: results.map((r: any) => ({
      id: r.id,
      name: r.name,
      ...(r.audience_size_lower_bound != null && {
        audience_size: `${Number(r.audience_size_lower_bound).toLocaleString()}–${Number(r.audience_size_upper_bound ?? 0).toLocaleString()}`,
      }),
      ...(r.path?.length && { path: r.path.join(' > ') }),
      ...(r.description && { description: r.description }),
    })),
    usage: `Pass ids into targeting.interests or targeting.behaviors when calling meta_deploy_campaign or meta_update_adset. Example: { "interests": [{ "id": "${results[0]?.id ?? '123'}", "name": "${results[0]?.name ?? 'Example'}" }] }`,
  };
}

function formatTargetingRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    ...(r.audience_size_lower_bound != null && {
      audience_size: `${Number(r.audience_size_lower_bound).toLocaleString()}–${Number(r.audience_size_upper_bound ?? 0).toLocaleString()}`,
    }),
    ...(r.path?.length && { path: r.path.join(' > ') }),
    ...(r.description && { description: r.description }),
  };
}

async function handleSearchInterests(args: any): Promise<any> {
  const results = await searchTargetingExtended('adinterest', args.query, { limit: args.limit ?? 25 });
  return {
    query: args.query,
    results: results.map(formatTargetingRow),
    usage: 'Pass ids into targeting.interests when calling meta_deploy_campaign or meta_update_adset.',
  };
}

async function handleSearchBehaviors(args: any): Promise<any> {
  const results = await searchTargetingExtended('adTargetingCategory', args.query, { class: 'behaviors', limit: args.limit ?? 25 });
  return {
    query: args.query,
    results: results.map(formatTargetingRow),
    usage: 'Pass ids into targeting.behaviors when calling meta_deploy_campaign or meta_update_adset.',
  };
}

async function handleSearchDemographics(args: any): Promise<any> {
  const results = await searchTargetingExtended('adTargetingCategory', args.query ?? '', { class: args.class, limit: args.limit ?? 25 });
  return {
    class: args.class,
    query: args.query ?? '',
    results: results.map(formatTargetingRow),
    usage: 'Pass ids into targeting.flexible_spec when calling meta_deploy_campaign or meta_update_adset.',
  };
}

async function handleSearchGeoLocations(args: any): Promise<any> {
  const locationTypes = args.location_types ?? [];
  const results = await searchGeoLocations(args.query, locationTypes, args.limit ?? 25);
  return {
    query: args.query,
    results: results.map((r: any) => ({
      key: r.key,
      name: r.name,
      type: r.type,
      country_code: r.country_code,
      region: r.region,
      country_name: r.country_name,
    })),
    usage: 'Pass the key into targeting.geo_locations.cities / .regions / .countries when calling meta_deploy_campaign.',
  };
}

async function handleGetInterestSuggestions(args: any): Promise<any> {
  const results = await getInterestSuggestions(args.interest_ids, args.limit ?? 25);
  return {
    interest_ids: args.interest_ids,
    suggestions: results.map(formatTargetingRow),
  };
}

async function handleEstimateAudienceSize(args: any): Promise<any> {
  const targetingSpec = buildTargetingSpec(args.targeting);
  const goal = args.optimization_goal ?? 'IMPRESSIONS';
  const estimate = await estimateAudienceSize(targetingSpec, goal);
  if (!estimate) return { estimate_ready: false, message: 'No estimate available for this targeting configuration.' };
  return {
    estimate_ready: estimate.estimate_ready,
    lower_bound: estimate.estimate_dau?.lower_bound ?? estimate.daily_outcomes_curve?.[0]?.reach ?? null,
    upper_bound: estimate.estimate_dau?.upper_bound ?? null,
    estimate_mau: estimate.estimate_mau_upper_bound ?? null,
    optimization_goal: goal,
    note: 'Bounds represent estimated daily reach.',
  };
}

async function handleGetAdImage(args: any): Promise<any> {
  if (!args.ad_id && !args.creative_id) {
    throw new Error('Provide either ad_id or creative_id');
  }

  let creativeId = args.creative_id;

  if (!creativeId && args.ad_id) {
    // Fetch creative ID from ad
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'creative{id,thumbnail_url,image_url}',
    });
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${args.ad_id}?${qp.toString()}`);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    creativeId = data.creative?.id;
    if (!creativeId) throw new Error('Could not find creative for ad ' + args.ad_id);
  }

  const creative = await getCreativeDetails(creativeId);
  const imageUrl = creative.thumbnail_url ?? creative.image_url;
  if (!imageUrl) throw new Error('No image URL found for creative ' + creativeId);

  const { data: base64, mimeType } = await downloadImageAsBase64(imageUrl);

  return {
    _mcp_image: { data: base64, mimeType },
    creative_id: creative.id,
    name: creative.name,
    status: creative.status,
  };
}

async function getAdDetails(args: any): Promise<any> {
  const ad = await apiGetAdDetails(args.ad_id);
  return {
    id: ad.id,
    name: ad.name,
    status: ad.effective_status ?? ad.status,
    configured_status: ad.configured_status,
    adset_id: ad.adset_id,
    campaign_id: ad.campaign_id,
    bid_amount: ad.bid_amount ? `${(parseInt(ad.bid_amount) / 100).toFixed(2)}` : null,
    created: ad.created_time,
    updated: ad.updated_time,
    creative: ad.creative ? {
      id: ad.creative.id,
      name: ad.creative.name,
      thumbnail_url: ad.creative.thumbnail_url ?? null,
      has_object_story_spec: !!ad.creative.object_story_spec,
      has_asset_feed_spec: !!ad.creative.asset_feed_spec,
    } : null,
    tracking_specs: ad.tracking_specs ?? null,
  };
}

async function getAdSetDetails(args: any): Promise<any> {
  const s = await apiGetAdSetDetails(args.adset_id);
  return {
    id: s.id,
    name: s.name,
    status: s.effective_status ?? s.status,
    campaign_id: s.campaign_id,
    daily_budget: s.daily_budget ? `${(parseInt(s.daily_budget) / 100).toFixed(2)}` : null,
    lifetime_budget: s.lifetime_budget ? `${(parseInt(s.lifetime_budget) / 100).toFixed(2)}` : null,
    budget_remaining: s.budget_remaining ? `${(parseInt(s.budget_remaining) / 100).toFixed(2)}` : null,
    bid_strategy: s.bid_strategy ?? null,
    bid_amount: s.bid_amount ? `${(parseInt(s.bid_amount) / 100).toFixed(2)}` : null,
    optimization_goal: s.optimization_goal ?? null,
    billing_event: s.billing_event ?? null,
    start_time: s.start_time ?? null,
    end_time: s.end_time ?? null,
    targeting: s.targeting ?? null,
    promoted_object: s.promoted_object ?? null,
    frequency_cap: s.frequency_cap ?? null,
    attribution_spec: s.attribution_spec ?? null,
    created: s.created_time,
    updated: s.updated_time,
  };
}

async function handleGetCreativeDetails(args: any): Promise<any> {
  const c = await getCreativeDetails(args.creative_id);
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    thumbnail_url: c.thumbnail_url ?? null,
    object_story_spec: c.object_story_spec ?? null,
    asset_feed_spec: c.asset_feed_spec ?? null,
  };
}

async function handleListPages(args: any): Promise<any> {
  const pages = await listPages(args.limit ?? 25);
  return {
    pages: pages.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      fan_count: p.fan_count ?? null,
      tasks: p.tasks ?? null,
    })),
    note: 'Use the page id when creating lead forms (meta_create_lead_form), page-post ads (meta_deploy_campaign), or engagement audiences (meta_create_engagement_audience).',
  };
}

async function handlePredictReach(args: any): Promise<any> {
  const targetingSpec = buildTargetingSpec(args.targeting);
  const goal = args.optimization_goal ?? 'IMPRESSIONS';
  const budgetCents = args.daily_budget_usd ? Math.round(args.daily_budget_usd * 100) : undefined;

  const estimate = await estimateAudienceSize(targetingSpec, goal, budgetCents);
  if (!estimate) return { estimate_ready: false, message: 'No estimate available for this targeting configuration.' };

  const result: Record<string, any> = {
    estimate_ready: estimate.estimate_ready,
    daily_reach_lower: estimate.estimate_dau?.lower_bound ?? null,
    daily_reach_upper: estimate.estimate_dau?.upper_bound ?? null,
    monthly_active_users: estimate.estimate_mau_upper_bound ?? null,
    optimization_goal: goal,
  };

  if (estimate.daily_outcomes_curve?.length) {
    result.reach_curve = estimate.daily_outcomes_curve.slice(0, 10).map((pt: any) => ({
      spend: `$${(pt.spend / 100).toFixed(2)}`,
      reach: pt.reach,
      impressions: pt.impressions,
    }));
    result.note = 'reach_curve shows estimated reach at increasing spend levels (up to 10 points).';
  }

  return result;
}

async function handleBulkUpdateStatus(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated: set ${args.ids.length} objects to ${args.status}`, ids: args.ids };
  }

  const results = await batchUpdateStatus(args.ids, args.status);
  const summary = results.map((r: any, i: number) => {
    const body = r.body ? (() => { try { return JSON.parse(r.body); } catch { return {}; } })() : {};
    return {
      id: args.ids[i],
      http_status: r.code,
      success: r.code >= 200 && r.code < 300 && !body.error,
      error: body.error?.message ?? null,
    };
  });

  const succeeded = summary.filter((r: any) => r.success).length;
  return {
    updated: succeeded,
    failed: summary.length - succeeded,
    status: args.status,
    results: summary,
  };
}

async function addAd(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated: Ad "${args.ad_name}" in adset ${args.adset_id}` };
  }

  try {
    const result = await createAd({
      name: args.ad_name,
      status: args.status ?? 'PAUSED',
      adset_id: args.adset_id,
      creative: {
        object_story_spec: {
          page_id: args.page_id,
          link_data: {
            image_hash: args.image_hash,
            link: args.link_url,
            message: args.body,
            name: args.headline,
            call_to_action: { type: args.call_to_action ?? 'LEARN_MORE' },
          },
        },
      },
    });

    return { success: true, ad_id: result.id, ad_name: args.ad_name, adset_id: args.adset_id, status: args.status ?? 'PAUSED' };
  } catch (error: any) {
    const fbErr =
      error?.response?.error ??
      error?.response?.data?.error ??
      error?.body?.error ??
      error?.error ??
      null;

    let errorDetail: string;
    if (fbErr) {
      errorDetail = `[Meta API ${fbErr.code ?? '?'}] ${fbErr.error_user_title ?? fbErr.message ?? 'Unknown'}`;
      if (fbErr.error_user_msg) errorDetail += ` — ${fbErr.error_user_msg}`;
      if (fbErr.error_subcode) errorDetail += ` (subcode ${fbErr.error_subcode})`;
    } else {
      errorDetail = error?.message ?? String(error);
    }

    return { success: false, error: errorDetail };
  }
}

// ── Local Graph API helper for endpoints not in the SDK ──

async function graphGet(objectPath: string, params: Record<string, any> = {}): Promise<any> {
  const qp = new URLSearchParams({ access_token: config.accessToken });
  for (const [k, v] of Object.entries(params)) {
    qp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}?${qp.toString()}`;
  const response = await fetch(url);
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

async function handleGetAdPreview(args: any): Promise<any> {
  const format = args.ad_format ?? 'DESKTOP_FEED_STANDARD';
  const result = await rateLimitedCall(() =>
    graphGet(`${args.ad_id}/previews`, { ad_format: format }),
  );

  const preview = result.data?.[0];
  if (!preview) return { success: false, error: 'No preview available for this ad format.' };

  return {
    ad_id: args.ad_id,
    format,
    iframe_snippet: preview.body,
    shareable_link: preview.preview_shareable_link ?? null,
    note: 'Open shareable_link in a browser to preview the ad. The iframe can be embedded in a web page.',
  };
}

async function handleGetAccountBilling(): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(config.adAccountId, {
      fields: 'amount_spent,spend_cap,balance,currency,funding_source_details',
    }),
  );

  const spent = result.amount_spent ? (parseInt(result.amount_spent) / 100).toFixed(2) : '0.00';
  const cap = result.spend_cap ? (parseInt(result.spend_cap) / 100).toFixed(2) : null;
  const balance = result.balance ? (parseInt(result.balance) / 100).toFixed(2) : null;

  return {
    currency: result.currency,
    amount_spent: spent,
    spend_cap: cap,
    remaining: cap ? (parseFloat(cap) - parseFloat(spent)).toFixed(2) : null,
    balance,
    funding_source: result.funding_source_details?.display_string ?? result.funding_source_details?.type ?? null,
  };
}

async function handleGetRecommendations(args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(`${config.adAccountId}/recommendations`, {
      fields: 'title,message,blame_field,code,confidence,estimated_daily_results,importance,recommendation_data',
      limit: args.limit ?? 10,
    }),
  );

  const recommendations = (result.data ?? []).map((r: any) => ({
    title: r.title ?? null,
    message: r.message ?? null,
    importance: r.importance ?? null,
    confidence: r.confidence ?? null,
    blame_field: r.blame_field ?? null,
    code: r.code ?? null,
    estimated_daily_results: r.estimated_daily_results ?? null,
  }));

  return {
    recommendations,
    total: recommendations.length,
    note: recommendations.length === 0 ? 'No recommendations found — account is well optimized.' : undefined,
  };
}
