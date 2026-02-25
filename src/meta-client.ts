import type { TenantContext } from './tenant-context.js';
import { rateLimitedCall } from './utils/rate-limiter.js';
import { validateMetaId, graphGet, graphPost } from './utils/graph.js';
import type { AccountContext } from './utils/schemas.js';

// ── Account Context (cached per ad account) ──

const accountContextCache = new Map<string, AccountContext>();

export async function getAccountContext(ctx: TenantContext): Promise<AccountContext> {
  const cached = accountContextCache.get(ctx.adAccountId);
  if (cached) return cached;

  const data = await rateLimitedCall(() =>
    graphGet(ctx, ctx.adAccountId, {
      fields: 'account_id,name,currency,timezone_name,account_status,disable_reason',
    }),
  );

  const context: AccountContext = {
    id: data.account_id,
    name: data.name,
    currency: data.currency,
    timezone: data.timezone_name,
    status: data.account_status,
    disable_reason: data.disable_reason,
  };

  accountContextCache.set(ctx.adAccountId, context);
  return context;
}

export function clearAccountCache(adAccountId?: string): void {
  if (adAccountId) {
    accountContextCache.delete(adAccountId);
  } else {
    accountContextCache.clear();
  }
}

// ── Generic Fetchers ──

const INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'cpm', 'frequency', 'reach',
  'actions', 'action_values',
  'unique_clicks', 'unique_ctr', 'unique_link_clicks_ctr',
  'outbound_clicks', 'outbound_clicks_ctr',
  'inline_link_clicks', 'inline_link_click_ctr',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
  'video_avg_time_watched_actions',
  'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
];

export async function fetchCampaigns(
  ctx: TenantContext,
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  return rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/campaigns`, { fields: fields.join(','), ...params }),
  ).then(r => r.data ?? []);
}

export async function fetchAdSets(
  ctx: TenantContext,
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  return rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/adsets`, { fields: fields.join(','), ...params }),
  ).then(r => r.data ?? []);
}

export async function fetchAds(
  ctx: TenantContext,
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  return rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/ads`, { fields: fields.join(','), ...params }),
  ).then(r => r.data ?? []);
}

export async function fetchAccountInsights(
  ctx: TenantContext,
  params: Record<string, any>,
): Promise<any[]> {
  return rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/insights`, { fields: INSIGHT_FIELDS.join(','), ...params }),
  ).then(r => r.data ?? []);
}

export async function fetchCampaignInsights(
  ctx: TenantContext,
  campaignId: string,
  params: Record<string, any>,
): Promise<any[]> {
  return rateLimitedCall(() =>
    graphGet(ctx, `${campaignId}/insights`, { fields: INSIGHT_FIELDS.join(','), ...params }),
  ).then(r => r.data ?? []);
}

export async function fetchInsightsBreakdown(
  ctx: TenantContext,
  params: Record<string, any>,
): Promise<any[]> {
  const fields = [...INSIGHT_FIELDS, 'campaign_id', 'campaign_name'];
  return rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/insights`, { fields: fields.join(','), ...params }),
  ).then(r => r.data ?? []);
}

// ── Mutators ──

export async function createCampaign(ctx: TenantContext, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => graphPost(ctx, `${ctx.adAccountId}/campaigns`, params));
}

export async function createAdSet(ctx: TenantContext, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => graphPost(ctx, `${ctx.adAccountId}/adsets`, params));
}

export async function createAd(ctx: TenantContext, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => graphPost(ctx, `${ctx.adAccountId}/ads`, params));
}

export async function deleteCampaign(ctx: TenantContext, id: string): Promise<void> {
  validateMetaId(id);
  await rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${ctx.apiVersion}/${id}`;
    const formBody = new URLSearchParams({ access_token: ctx.accessToken });
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
  });
}

export async function deleteAdSet(ctx: TenantContext, id: string): Promise<void> {
  validateMetaId(id);
  await rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${ctx.apiVersion}/${id}`;
    const formBody = new URLSearchParams({ access_token: ctx.accessToken });
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
  });
}

export async function deleteAd(ctx: TenantContext, id: string): Promise<void> {
  validateMetaId(id);
  await rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${ctx.apiVersion}/${id}`;
    const formBody = new URLSearchParams({ access_token: ctx.accessToken });
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
  });
}

export async function updateCampaignStatus(ctx: TenantContext, id: string, status: string): Promise<any> {
  validateMetaId(id);
  return rateLimitedCall(() => graphPost(ctx, id, { status }));
}

export async function readAd(ctx: TenantContext, id: string, fields: string[]): Promise<any> {
  validateMetaId(id);
  return rateLimitedCall(() => graphGet(ctx, id, { fields: fields.join(',') }));
}

export async function readCampaign(ctx: TenantContext, id: string, fields: string[]): Promise<any> {
  validateMetaId(id);
  return rateLimitedCall(() => graphGet(ctx, id, { fields: fields.join(',') }));
}

export async function readAdSet(ctx: TenantContext, id: string, fields: string[]): Promise<any> {
  validateMetaId(id);
  return rateLimitedCall(() => graphGet(ctx, id, { fields: fields.join(',') }));
}

// ── Generic Object Update ──

async function postUpdate(ctx: TenantContext, id: string, params: Record<string, any>): Promise<any> {
  validateMetaId(id);
  return graphPost(ctx, id, params);
}

export async function updateCampaign(ctx: TenantContext, id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(ctx, id, params));
}

export async function updateAdSet(ctx: TenantContext, id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(ctx, id, params));
}

export async function updateAd(ctx: TenantContext, id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(ctx, id, params));
}

// ── Custom Audiences ──

export async function createCustomAudience(ctx: TenantContext, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => graphPost(ctx, `${ctx.adAccountId}/customaudiences`, params));
}

export async function addUsersToAudience(ctx: TenantContext, audienceId: string, payload: any): Promise<any> {
  validateMetaId(audienceId);
  return rateLimitedCall(() =>
    graphPost(ctx, `${audienceId}/users`, { payload: JSON.stringify(payload) }),
  );
}

export async function fetchAudiences(ctx: TenantContext, params: Record<string, any>): Promise<any[]> {
  return rateLimitedCall(async () => {
    const result = await graphGet(ctx, `${ctx.adAccountId}/customaudiences`, {
      fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,data_source,time_created,time_updated,delivery_status',
      limit: params.limit ?? 25,
      ...(params.after ? { after: params.after } : {}),
    });
    return result.data ?? [];
  });
}

export async function deleteAudience(ctx: TenantContext, id: string): Promise<void> {
  validateMetaId(id);
  await rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${ctx.apiVersion}/${id}`;
    const formBody = new URLSearchParams({ access_token: ctx.accessToken });
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
  }) as unknown as void;
}

// ── Pixels ──

export async function listPixels(ctx: TenantContext, limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const result = await graphGet(ctx, `${ctx.adAccountId}/adspixels`, {
      fields: 'id,name,creation_time,last_fired_time,is_unavailable',
      limit,
    });
    return result.data ?? [];
  });
}

export async function getPixelStats(ctx: TenantContext, pixelId: string, params: Record<string, any>): Promise<any> {
  validateMetaId(pixelId);
  return rateLimitedCall(() => graphGet(ctx, `${pixelId}/stats`, params));
}

// ── Targeting Search ──

export async function searchTargetingExtended(
  ctx: TenantContext,
  type: string,
  query: string,
  opts: { class?: string; limit?: number } = {},
): Promise<any[]> {
  return rateLimitedCall(async () => {
    const params: Record<string, any> = { type, q: query, limit: opts.limit ?? 25 };
    if (opts.class) params.class = opts.class;
    const result = await graphGet(ctx, 'search', params);
    return result.data ?? [];
  });
}

export async function searchGeoLocations(
  ctx: TenantContext,
  query: string,
  locationTypes: string[],
  limit: number,
): Promise<any[]> {
  return rateLimitedCall(async () => {
    const params: Record<string, any> = { type: 'adgeolocation', q: query, limit };
    if (locationTypes.length) params.location_types = JSON.stringify(locationTypes);
    const result = await graphGet(ctx, 'search', params);
    return result.data ?? [];
  });
}

export async function getInterestSuggestions(ctx: TenantContext, interestIds: string[], limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const result = await graphGet(ctx, 'search', {
      type: 'adinterestsuggestion',
      interest_list: JSON.stringify(interestIds),
      limit,
    });
    return result.data ?? [];
  });
}

export async function estimateAudienceSize(
  ctx: TenantContext,
  targetingSpec: any,
  optimizationGoal: string,
  dailyBudgetCents?: number,
): Promise<any> {
  return rateLimitedCall(async () => {
    const params: Record<string, any> = {
      targeting_spec: JSON.stringify(targetingSpec),
      optimization_goal: optimizationGoal,
    };
    if (dailyBudgetCents != null) params.daily_budget = dailyBudgetCents;
    const result = await graphGet(ctx, `${ctx.adAccountId}/delivery_estimate`, params);
    return (result.data ?? [])[0] ?? null;
  });
}

export async function getCreativeDetails(ctx: TenantContext, creativeId: string): Promise<any> {
  validateMetaId(creativeId);
  return rateLimitedCall(() =>
    graphGet(ctx, creativeId, {
      fields: 'id,name,thumbnail_url,image_url,object_story_spec,asset_feed_spec,status',
    }),
  );
}

export async function downloadImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('.fbcdn.net')) {
    throw new Error('Image URL must be from Meta CDN (*.fbcdn.net)');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? detectMime(buffer);
  return { data: buffer.toString('base64'), mimeType };
}

export async function searchTargeting(ctx: TenantContext, type: 'interest' | 'behavior', query: string): Promise<any[]> {
  return rateLimitedCall(async () => {
    const params: Record<string, any> = { q: query, limit: 25 };
    if (type === 'interest') {
      params.type = 'adinterest';
    } else {
      params.type = 'adTargetingCategory';
      params.class = 'behaviors';
    }
    const result = await graphGet(ctx, 'search', params);
    return result.data ?? [];
  });
}

// ── Async Insights ──

export async function startAsyncInsights(ctx: TenantContext, params: Record<string, any>): Promise<string> {
  return rateLimitedCall(async () => {
    const { campaign_id, breakdowns, time_range, time_increment, limit, level } = params;

    const edge = campaign_id
      ? `${campaign_id}/insights`
      : `${ctx.adAccountId}/insights`;

    const fields = [...INSIGHT_FIELDS, 'campaign_name', 'adset_name', 'ad_name', 'campaign_id', 'adset_id', 'ad_id', 'date_start', 'date_stop'];

    const postParams: Record<string, any> = {
      fields: fields.join(','),
      limit: limit ?? 200,
      sort: 'spend_descending',
      async: 'true',
    };

    if (time_range) postParams.time_range = JSON.stringify(time_range);
    if (breakdowns?.length) postParams.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(',') : String(breakdowns);
    if (time_increment != null) postParams.time_increment = time_increment;
    if (level) postParams.level = level;

    const data = await graphPost(ctx, edge, postParams);

    const reportRunId = data.report_run_id;
    if (!reportRunId) throw new Error(`Async insights response missing report_run_id. Raw: ${JSON.stringify(data)}`);
    return String(reportRunId);
  });
}

export async function pollInsightsReport(ctx: TenantContext, reportRunId: string, maxAttempts = 40): Promise<void> {
  const BASE_MS = 5_000;
  const MAX_MS = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_MS * Math.pow(1.5, attempt - 1), MAX_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await rateLimitedCall(() =>
      graphGet(ctx, reportRunId, { fields: 'id,async_status,async_percent_completion' }),
    );

    const status = (result.async_status ?? '').toLowerCase().replace(/ /g, '_');

    if (status === 'job_completed') return;
    if (status === 'job_failed' || status === 'job_skipped') {
      throw new Error(`Insights report ${reportRunId} ${status}`);
    }
  }

  throw new Error(`Insights report ${reportRunId} did not complete within ~10 minutes`);
}

export async function fetchInsightsReport(ctx: TenantContext, reportRunId: string, after?: string): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const params: Record<string, any> = { limit: 200 };
    if (after) params.after = after;
    const result = await graphGet(ctx, `${reportRunId}/insights`, params);
    return { data: result.data ?? [], paging: result.paging };
  });
}

// ── Media Library ──

export async function listAdImages(ctx: TenantContext, params: { limit: number; after?: string }): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const qParams: Record<string, any> = {
      fields: 'hash,name,url,width,height,status,created_time',
      limit: params.limit,
    };
    if (params.after) qParams.after = params.after;
    const result = await graphGet(ctx, `${ctx.adAccountId}/adimages`, qParams);
    return { data: result.data ?? [], paging: result.paging };
  });
}

export async function listAdVideos(ctx: TenantContext, params: { limit: number; after?: string }): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const qParams: Record<string, any> = {
      fields: 'id,title,description,length,status,created_time,picture',
      limit: params.limit,
    };
    if (params.after) qParams.after = params.after;
    const result = await graphGet(ctx, `${ctx.adAccountId}/advideos`, qParams);
    return { data: result.data ?? [], paging: result.paging };
  });
}

export async function listPages(ctx: TenantContext, limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const result = await graphGet(ctx, 'me/accounts', {
      fields: 'id,name,category,fan_count,tasks',
      limit,
    });
    return result.data ?? [];
  });
}

export async function getAdDetails(ctx: TenantContext, adId: string): Promise<any> {
  validateMetaId(adId);
  return rateLimitedCall(() =>
    graphGet(ctx, adId, {
      fields: 'id,name,status,effective_status,configured_status,creative{id,name,thumbnail_url,object_story_spec,asset_feed_spec},adset_id,campaign_id,bid_amount,created_time,updated_time,tracking_specs',
    }),
  );
}

export async function getAdSetDetails(ctx: TenantContext, adSetId: string): Promise<any> {
  validateMetaId(adSetId);
  return rateLimitedCall(() =>
    graphGet(ctx, adSetId, {
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,optimization_goal,billing_event,start_time,end_time,targeting,promoted_object,frequency_cap,pacing_type,attribution_spec,created_time,updated_time',
    }),
  );
}

export async function batchUpdateStatus(ctx: TenantContext, ids: string[], status: string): Promise<any[]> {
  ids.forEach(validateMetaId);
  return rateLimitedCall(async () => {
    const batch = ids.map(id => ({
      method: 'POST',
      relative_url: `${ctx.apiVersion}/${id}`,
      body: `status=${encodeURIComponent(status)}&access_token=${encodeURIComponent(ctx.accessToken)}`,
    }));
    const formBody = new URLSearchParams({
      access_token: ctx.accessToken,
      batch: JSON.stringify(batch),
    });
    const response = await fetch('https://graph.facebook.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Array.isArray(data) ? data : [];
  });
}

// ── Breakdown Insights ──

export async function fetchBreakdownInsights(ctx: TenantContext, params: Record<string, any>): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const { campaign_id, breakdowns, time_range, time_increment, limit, after, level } = params;

    const edge = campaign_id
      ? `${campaign_id}/insights`
      : `${ctx.adAccountId}/insights`;

    const fields = [...INSIGHT_FIELDS, 'campaign_name', 'adset_name', 'ad_name', 'campaign_id', 'adset_id', 'ad_id', 'date_start', 'date_stop'];

    const qp: Record<string, any> = {
      fields: fields.join(','),
      limit: limit ?? 50,
      sort: 'spend_descending',
    };

    if (time_range) qp.time_range = JSON.stringify(time_range);
    if (breakdowns?.length) qp.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(',') : String(breakdowns);
    if (time_increment != null) qp.time_increment = time_increment;
    if (level) qp.level = level;
    if (after) qp.after = after;

    const result = await graphGet(ctx, edge, qp);
    return { data: result.data ?? [], paging: result.paging };
  });
}

// ── MIME Detection ──

function detectMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  return 'image/png';
}
