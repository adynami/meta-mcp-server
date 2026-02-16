import { z } from 'zod';
import { config } from '../config.js';
import {
  fetchCampaigns, fetchAdSets, fetchAds,
  fetchAccountInsights, fetchCampaignInsights,
  updateCampaignStatus as apiUpdateStatus,
  readCampaign, readAdSet, readAd as apiReadAd,
  getAccountContext,
} from '../meta-client.js';
import { resolveRange, type TimeRangeKey } from '../utils/date-ranges.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';
import {
  timeRangeSchema, paginationSchema, campaignStatusSchema,
  type CampaignSummary, type AdSetSummary, type AdSummary, type InsightsSummary,
} from '../utils/schemas.js';

// ── Tool definitions ──

export const managementTools = [
  {
    name: 'list_campaigns',
    description: 'List campaigns in the ad account with key fields only. Returns max `limit` results (default 5). Use `status_filter` to filter by delivery status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (1-50, default 5)', default: 5 },
        status_filter: {
          type: 'array',
          items: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
          description: 'Filter by status (default: all)',
        },
        after: { type: 'string', description: 'Pagination cursor' },
      },
    },
  },
  {
    name: 'get_campaign_details',
    description: 'Get detailed info for a single campaign by ID, including its ad sets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'The campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'list_adsets',
    description: 'List ad sets, optionally filtered by campaign ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Filter by campaign ID (optional)' },
        limit: { type: 'number', default: 5 },
        status_filter: {
          type: 'array',
          items: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] },
        },
      },
    },
  },
  {
    name: 'list_ads',
    description: 'List ads, optionally filtered by ad set or campaign.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'Filter by ad set ID' },
        campaign_id: { type: 'string', description: 'Filter by campaign ID' },
        limit: { type: 'number', default: 5 },
      },
    },
  },
  {
    name: 'get_insights',
    description: 'Get performance metrics for the account or a specific campaign. All metrics (CTR, CPC, ROAS, CPA) are pre-calculated.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'],
          description: 'Predefined time range (default: last_7d)',
        },
        campaign_id: { type: 'string', description: 'Get insights for specific campaign (optional)' },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Breakdown level (default: account)',
        },
        limit: { type: 'number', default: 5, description: 'Max rows when level != account' },
      },
    },
  },
  {
    name: 'update_campaign_status',
    description: 'Pause, activate, or archive a campaign.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID to update' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], description: 'New status' },
      },
      required: ['campaign_id', 'status'],
    },
  },
  {
    name: 'get_account_info',
    description: 'Get ad account metadata: name, currency, timezone, status.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

// ── Handlers ──

export async function handleManagementTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_campaigns':
      return listCampaigns(args);
    case 'get_campaign_details':
      return getCampaignDetails(args);
    case 'list_adsets':
      return listAdSets(args);
    case 'list_ads':
      return listAds(args);
    case 'get_insights':
      return getInsights(args);
    case 'update_campaign_status':
      return updateStatus(args);
    case 'get_account_info':
      return getAccountContext();
    default:
      throw new Error(`Unknown management tool: ${name}`);
  }
}

async function listCampaigns(args: any): Promise<{ campaigns: CampaignSummary[]; has_more: boolean }> {
  const limit = args.limit ?? 5;
  const params: Record<string, any> = { limit: limit + 1 };

  if (args.status_filter?.length) {
    params.filtering = [{ field: 'effective_status', operator: 'IN', value: args.status_filter }];
  }
  if (args.after) params.after = args.after;

  const fields = ['id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget', 'buying_type'];
  const raw = await fetchCampaigns(fields, params);
  const hasMore = raw.length > limit;
  const items = raw.slice(0, limit);

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
  const campaign = await readCampaign(args.campaign_id, fields);

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective,
    daily_budget: campaign.daily_budget ? `${(parseInt(campaign.daily_budget) / 100).toFixed(2)}` : null,
    lifetime_budget: campaign.lifetime_budget ? `${(parseInt(campaign.lifetime_budget) / 100).toFixed(2)}` : null,
    buying_type: campaign.buying_type,
    bid_strategy: campaign.bid_strategy,
    created: campaign.created_time,
    start_time: campaign.start_time,
    stop_time: campaign.stop_time,
  };
}

async function listAdSets(args: any): Promise<{ adsets: AdSetSummary[] }> {
  const limit = args.limit ?? 5;
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
  if (t.age_min || t.age_max) parts.push(`Age: ${t.age_min ?? '?'}-${t.age_max ?? '?'}`);
  if (t.geo_locations?.countries) parts.push(`Geo: ${t.geo_locations.countries.join(', ')}`);
  if (t.genders?.length) {
    const g = t.genders.map((n: number) => n === 1 ? 'M' : n === 2 ? 'F' : 'All');
    parts.push(`Gender: ${g.join(', ')}`);
  }
  return parts.join(' | ') || 'Broad targeting';
}

async function listAds(args: any): Promise<{ ads: AdSummary[] }> {
  const limit = args.limit ?? 5;
  const params: Record<string, any> = { limit };
  const filtering: any[] = [];
  if (args.adset_id) filtering.push({ field: 'adset_id', operator: 'EQUAL', value: args.adset_id });
  if (args.campaign_id) filtering.push({ field: 'campaign_id', operator: 'EQUAL', value: args.campaign_id });
  if (filtering.length) params.filtering = filtering;

  const fields = ['id', 'name', 'status', 'creative'];
  const raw = await fetchAds(fields, params);

  return {
    ads: raw.slice(0, limit).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.effective_status ?? a.status,
      creative_id: a.creative?.id ?? null,
      preview_url: null,
    })),
  };
}

async function getInsights(args: any): Promise<InsightsSummary | InsightsSummary[]> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = resolveRange(rangeKey);
  const level = args.level ?? 'account';
  const limit = args.limit ?? 5;

  const params: Record<string, any> = {
    time_range: range,
    level,
  };

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
    return { entity_id: config.adAccountId, entity_name: 'Account', date_range: `${range.since} to ${range.until}`, impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, conversion_value: 0, roas: 0, cpa: 0, frequency: 0, reach: 0 };
  }

  const results: InsightsSummary[] = raw.slice(0, level === 'account' ? 1 : limit).map((row: any) => {
    const m = computeMetrics(row as RawInsightRow);
    return {
      entity_id: row.campaign_id ?? row.adset_id ?? row.ad_id ?? config.adAccountId,
      entity_name: row.campaign_name ?? row.adset_name ?? row.ad_name ?? 'Account',
      date_range: `${row.date_start} to ${row.date_stop}`,
      ...m,
    };
  });

  return level === 'account' ? results[0] : results;
}

async function updateStatus(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated success: Campaign ${args.campaign_id} -> ${args.status}` };
  }

  await apiUpdateStatus(args.campaign_id, args.status);
  return { success: true, campaign_id: args.campaign_id, new_status: args.status };
}
