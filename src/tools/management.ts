import { config } from '../config.js';
import {
  fetchCampaigns, fetchAdSets, fetchAds,
  fetchAccountInsights, fetchCampaignInsights,
  updateCampaignStatus as apiUpdateStatus,
  readCampaign, readAdSet, readAd as apiReadAd,
  getAccountContext, createAd,
} from '../meta-client.js';
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
          enum: ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'],
          description: 'Time period to analyze (default: last_7d)',
        },
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
    case 'meta_add_ad': return addAd(args);
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

  const fields = ['id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget', 'buying_type'];
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
  const fields = ['id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget', 'buying_type', 'bid_strategy', 'created_time', 'start_time', 'stop_time'];
  const c = await readCampaign(args.campaign_id, fields);

  return {
    id: c.id,
    name: c.name,
    status: c.status,
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

  const fields = ['id', 'name', 'status', 'daily_budget', 'lifetime_budget', 'bid_strategy', 'optimization_goal', 'targeting'];
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

  const fields = ['id', 'name', 'status'];
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
  const range = resolveRange(rangeKey);
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
