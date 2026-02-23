import * as fs from 'node:fs';
import * as path from 'node:path';
import bizSdk from 'facebook-nodejs-business-sdk';
import { config } from './config.js';
import { rateLimitedCall } from './utils/rate-limiter.js';
import type { AccountContext } from './utils/schemas.js';

const { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad } = bizSdk;

let api: InstanceType<typeof FacebookAdsApi> | null = null;
let cachedAccountContext: AccountContext | null = null;

export function initApi(): void {
  api = FacebookAdsApi.init(config.accessToken);
  api.setDebug(false);
}

export function getAdAccount(): InstanceType<typeof AdAccount> {
  return new AdAccount(config.adAccountId);
}

export async function getAccountContext(): Promise<AccountContext> {
  if (cachedAccountContext) return cachedAccountContext;

  const account = getAdAccount();
  const result = await rateLimitedCall(() =>
    account.read(['account_id', 'name', 'currency', 'timezone_name', 'account_status', 'disable_reason']),
  );

  cachedAccountContext = {
    id: result.account_id,
    name: result.name,
    currency: result.currency,
    timezone: result.timezone_name,
    status: result.account_status,
    disable_reason: result.disable_reason,
  };

  return cachedAccountContext;
}

export function clearAccountCache(): void {
  cachedAccountContext = null;
}

// ── Generic Fetchers ──

const INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'cpm', 'frequency', 'reach',
  'actions', 'action_values',
  // Unique / link metrics
  'unique_clicks', 'unique_ctr', 'unique_link_clicks_ctr',
  'outbound_clicks', 'outbound_clicks_ctr',
  'inline_link_clicks', 'inline_link_click_ctr',
  // Video engagement
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
  'video_avg_time_watched_actions',
  // Creative quality rankings
  'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
];

export async function fetchCampaigns(
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.getCampaigns(fields, params));
}

export async function fetchAdSets(
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.getAdSets(fields, params));
}

export async function fetchAds(
  fields: string[],
  params: Record<string, any>,
): Promise<any[]> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.getAds(fields, params));
}

export async function fetchAccountInsights(
  params: Record<string, any>,
): Promise<any[]> {
  const account = getAdAccount();
  return rateLimitedCall(() =>
    account.getInsights(INSIGHT_FIELDS, params),
  );
}

export async function fetchCampaignInsights(
  campaignId: string,
  params: Record<string, any>,
): Promise<any[]> {
  const campaign = new Campaign(campaignId);
  return rateLimitedCall(() =>
    campaign.getInsights(INSIGHT_FIELDS, params),
  );
}

export async function fetchInsightsBreakdown(
  params: Record<string, any>,
): Promise<any[]> {
  const account = getAdAccount();
  return rateLimitedCall(() =>
    account.getInsights(
      [...INSIGHT_FIELDS, 'campaign_id', 'campaign_name'],
      params,
    ),
  );
}

// ── Mutators ──

export async function createCampaign(params: Record<string, any>): Promise<any> {
  // Bypass FB SDK for all write operations — the SDK's createEdge
  // silently drops or mangles nested objects during serialization.
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/campaigns`;

    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    for (const [key, value] of Object.entries(params)) {
      formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function createAdSet(params: Record<string, any>): Promise<any> {
  // Bypass FB SDK — it can mangle nested objects like promoted_object and targeting.
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/adsets`;

    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    for (const [key, value] of Object.entries(params)) {
      formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function createAd(params: Record<string, any>): Promise<any> {
  // Bypass FB SDK — it strips nested objects like creative.object_story_spec
  // during serialization, sending only top-level scalar fields.
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/ads`;

    // The Graph API needs nested objects JSON-stringified as form params
    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    for (const [key, value] of Object.entries(params)) {
      formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function uploadAdImage(filePath: string): Promise<{ hash: string; url?: string }> {
  // Bypass the FB SDK's broken createAdImage — it doesn't handle file uploads correctly.
  // Use the Graph API directly with multipart/form-data.
  return rateLimitedCall(async () => {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Detect actual MIME type from file magic bytes, not extension
    const mime = detectMime(fileBuffer);

    const boundary = `----MetaMCP${Date.now()}`;
    const parts: Buffer[] = [];

    // File part
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));

    // Access token part
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${config.accessToken}\r\n`
    ));

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/adimages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    });

    const data = await response.json() as any;

    if (!response.ok || data.error) {
      const errMsg = data.error?.error_user_msg ?? data.error?.message ?? `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    // Response format: { images: { "filename.png": { hash: "...", url: "..." } } }
    if (data.images) {
      const key = Object.keys(data.images)[0];
      const img = data.images[key];
      return { hash: img.hash, url: img.url };
    }

    throw new Error('Unexpected response: no images in API response');
  });
}

function detectMime(buf: Buffer): string {
  // Check magic bytes
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  // Fallback to PNG
  return 'image/png';
}

export async function deleteCampaign(id: string): Promise<void> {
  const campaign = new Campaign(id);
  await rateLimitedCall(() => campaign.delete([]));
}

export async function deleteAdSet(id: string): Promise<void> {
  const adset = new AdSet(id);
  await rateLimitedCall(() => adset.delete([]));
}

export async function deleteAd(id: string): Promise<void> {
  const ad = new Ad(id);
  await rateLimitedCall(() => ad.delete([]));
}

export async function updateCampaignStatus(id: string, status: string): Promise<any> {
  const campaign = new Campaign(id);
  return rateLimitedCall(() => campaign.update([], { status }));
}

export async function readAd(id: string, fields: string[]): Promise<any> {
  const ad = new Ad(id);
  return rateLimitedCall(() => ad.read(fields));
}

export async function readCampaign(id: string, fields: string[]): Promise<any> {
  const campaign = new Campaign(id);
  return rateLimitedCall(() => campaign.read(fields));
}

export async function readAdSet(id: string, fields: string[]): Promise<any> {
  const adset = new AdSet(id);
  return rateLimitedCall(() => adset.read(fields));
}

// ── Video Upload ──

export async function uploadAdVideo(filePath: string): Promise<{ video_id: string }> {
  return rateLimitedCall(async () => {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = `----MetaMCPVideo${Date.now()}`;
    const parts: Buffer[] = [];

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${fileName}"\r\nContent-Type: video/mp4\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${config.accessToken}\r\n`
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${path.basename(filePath, path.extname(filePath))}\r\n`
    ));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/advideos`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    });

    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const errMsg = data.error?.error_user_msg ?? data.error?.message ?? `HTTP ${response.status}`;
      throw new Error(errMsg);
    }
    if (!data.id) throw new Error('Unexpected response: no video id returned');
    return { video_id: data.id };
  });
}

// ── Generic Object Update ──

async function postUpdate(id: string, params: Record<string, any>): Promise<any> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${id}`;
  const formBody = new URLSearchParams();
  formBody.append('access_token', config.accessToken);
  for (const [key, value] of Object.entries(params)) {
    formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

export async function updateCampaign(id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(id, params));
}

export async function updateAdSet(id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(id, params));
}

export async function updateAd(id: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(() => postUpdate(id, params));
}

// ── Custom Audiences ──

export async function createCustomAudience(params: Record<string, any>): Promise<any> {
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/customaudiences`;
    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    for (const [key, value] of Object.entries(params)) {
      formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function addUsersToAudience(audienceId: string, payload: any): Promise<any> {
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${audienceId}/users`;
    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    formBody.append('payload', JSON.stringify(payload));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function fetchAudiences(params: Record<string, any>): Promise<any[]> {
  return rateLimitedCall(async () => {
    const fields = 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,data_source,time_created,time_updated,delivery_status';
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields,
      limit: String(params.limit ?? 25),
      ...(params.after ? { after: params.after } : {}),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/customaudiences?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function deleteAudience(id: string): Promise<void> {
  return rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${id}`;
    const formBody = new URLSearchParams({ access_token: config.accessToken });
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

export async function listPixels(limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,name,creation_time,last_fired_time,is_unavailable',
      limit: String(limit),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/adspixels?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function getPixelStats(pixelId: string, params: Record<string, any>): Promise<any> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({ access_token: config.accessToken, ...params });
    const url = `https://graph.facebook.com/${config.apiVersion}/${pixelId}/stats?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data;
  });
}

// ── Targeting Search ──

export async function searchTargetingExtended(
  type: string,
  query: string,
  opts: { class?: string; limit?: number } = {},
): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      type,
      q: query,
      limit: String(opts.limit ?? 25),
    });
    if (opts.class) qp.append('class', opts.class);
    const url = `https://graph.facebook.com/${config.apiVersion}/search?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function searchGeoLocations(
  query: string,
  locationTypes: string[],
  limit: number,
): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      type: 'adgeolocation',
      q: query,
      limit: String(limit),
    });
    if (locationTypes.length) qp.append('location_types', JSON.stringify(locationTypes));
    const url = `https://graph.facebook.com/${config.apiVersion}/search?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function getInterestSuggestions(interestIds: string[], limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      type: 'adinterestsuggestion',
      interest_list: JSON.stringify(interestIds),
      limit: String(limit),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/search?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function estimateAudienceSize(
  targetingSpec: any,
  optimizationGoal: string,
  dailyBudgetCents?: number,
): Promise<any> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      targeting_spec: JSON.stringify(targetingSpec),
      optimization_goal: optimizationGoal,
      ...(dailyBudgetCents != null ? { daily_budget: String(dailyBudgetCents) } : {}),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/delivery_estimate?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return (data.data ?? [])[0] ?? null;
  });
}

export async function getCreativeDetails(creativeId: string): Promise<any> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,name,thumbnail_url,image_url,object_story_spec,asset_feed_spec,status',
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${creativeId}?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data;
  });
}

export async function downloadImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] ?? detectMime(buffer);
  return { data: buffer.toString('base64'), mimeType };
}

export async function searchTargeting(type: 'interest' | 'behavior', query: string): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      q: query,
      limit: '25',
    });
    if (type === 'interest') {
      qp.append('type', 'adinterest');
    } else {
      qp.append('type', 'adTargetingCategory');
      qp.append('class', 'behaviors');
    }
    const url = `https://graph.facebook.com/${config.apiVersion}/search?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

// ── Async Insights ──

/**
 * Start an async insights job. Returns the report_run_id.
 * Use pollInsightsReport() to wait for completion, then fetchInsightsReport() to get data.
 */
export async function startAsyncInsights(params: Record<string, any>): Promise<string> {
  return rateLimitedCall(async () => {
    const { campaign_id, breakdowns, time_range, time_increment, limit, level } = params;

    const edge = campaign_id
      ? `${config.apiVersion}/${campaign_id}/insights`
      : `${config.apiVersion}/${config.adAccountId}/insights`;

    const fields = [...INSIGHT_FIELDS, 'campaign_name', 'adset_name', 'ad_name', 'campaign_id', 'adset_id', 'ad_id', 'date_start', 'date_stop'];

    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    formBody.append('fields', fields.join(','));
    formBody.append('limit', String(limit ?? 200));
    formBody.append('sort', 'spend_descending');
    formBody.append('async', 'true');

    if (time_range) formBody.append('time_range', JSON.stringify(time_range));
    if (breakdowns?.length) formBody.append('breakdowns', Array.isArray(breakdowns) ? breakdowns.join(',') : String(breakdowns));
    if (time_increment != null) formBody.append('time_increment', String(time_increment));
    if (level) formBody.append('level', level);

    const url = `https://graph.facebook.com/${edge}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }

    const reportRunId = data.report_run_id;
    if (!reportRunId) throw new Error(`Async insights response missing report_run_id. Raw: ${JSON.stringify(data)}`);
    return String(reportRunId);
  });
}

/** Poll an async insights report until complete (up to ~10 minutes). */
export async function pollInsightsReport(reportRunId: string, maxAttempts = 40): Promise<void> {
  const BASE_MS = 5_000;
  const MAX_MS = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_MS * Math.pow(1.5, attempt - 1), MAX_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const result = await rateLimitedCall(async () => {
      const qp = new URLSearchParams({
        access_token: config.accessToken,
        fields: 'id,async_status,async_percent_completion',
      });
      const url = `https://graph.facebook.com/${config.apiVersion}/${reportRunId}?${qp.toString()}`;
      const response = await fetch(url);
      const data = await response.json() as any;
      if (!response.ok || data.error) {
        const e = data.error ?? {};
        throw new Error(e.message ?? `HTTP ${response.status}`);
      }
      return data;
    });

    const status = (result.async_status ?? '').toLowerCase().replace(/ /g, '_');

    if (status === 'job_completed') return;
    if (status === 'job_failed' || status === 'job_skipped') {
      throw new Error(`Insights report ${reportRunId} ${status}`);
    }
    // job_running or job_not_started — keep polling
  }

  throw new Error(`Insights report ${reportRunId} did not complete within ~10 minutes`);
}

/** Fetch results from a completed async insights report. */
export async function fetchInsightsReport(reportRunId: string, after?: string): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      limit: '200',
      ...(after ? { after } : {}),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${reportRunId}/insights?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return { data: data.data ?? [], paging: data.paging };
  });
}

// ── Media Library ──

export async function listAdImages(params: { limit: number; after?: string }): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'hash,name,url,width,height,status,created_time',
      limit: String(params.limit),
      ...(params.after ? { after: params.after } : {}),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/adimages?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return { data: data.data ?? [], paging: data.paging };
  });
}

export async function listAdVideos(params: { limit: number; after?: string }): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,title,description,length,status,created_time,picture',
      limit: String(params.limit),
      ...(params.after ? { after: params.after } : {}),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.adAccountId}/advideos?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return { data: data.data ?? [], paging: data.paging };
  });
}

export async function listPages(limit: number): Promise<any[]> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,name,category,fan_count,tasks',
      limit: String(limit),
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/me/accounts?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return data.data ?? [];
  });
}

export async function getAdDetails(adId: string): Promise<any> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,name,status,effective_status,configured_status,creative{id,name,thumbnail_url,object_story_spec,asset_feed_spec},adset_id,campaign_id,bid_amount,created_time,updated_time,tracking_specs',
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${adId}?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function getAdSetDetails(adSetId: string): Promise<any> {
  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,optimization_goal,billing_event,start_time,end_time,targeting,promoted_object,frequency_cap,pacing_type,attribution_spec,created_time,updated_time',
    });
    const url = `https://graph.facebook.com/${config.apiVersion}/${adSetId}?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });
}

export async function batchUpdateStatus(ids: string[], status: string): Promise<any[]> {
  return rateLimitedCall(async () => {
    const batch = ids.map(id => ({
      method: 'POST',
      relative_url: `${config.apiVersion}/${id}`,
      body: `status=${encodeURIComponent(status)}&access_token=${encodeURIComponent(config.accessToken)}`,
    }));
    const formBody = new URLSearchParams({
      access_token: config.accessToken,
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

export async function fetchBreakdownInsights(params: Record<string, any>): Promise<{ data: any[]; paging?: any }> {
  return rateLimitedCall(async () => {
    const { campaign_id, breakdowns, time_range, time_increment, limit, after, level } = params;

    const edge = campaign_id
      ? `${config.apiVersion}/${campaign_id}/insights`
      : `${config.apiVersion}/${config.adAccountId}/insights`;

    const fields = [...INSIGHT_FIELDS, 'campaign_name', 'adset_name', 'ad_name', 'campaign_id', 'adset_id', 'ad_id', 'date_start', 'date_stop'];

    const qp: Record<string, string> = {
      access_token: config.accessToken,
      fields: fields.join(','),
      limit: String(limit ?? 50),
      sort: 'spend_descending',
    };

    if (time_range) qp.time_range = JSON.stringify(time_range);
    if (breakdowns?.length) qp.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(',') : String(breakdowns);
    if (time_increment != null) qp.time_increment = String(time_increment);
    if (level) qp.level = level;
    if (after) qp.after = after;

    const url = `https://graph.facebook.com/${edge}?${new URLSearchParams(qp).toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }
    return { data: data.data ?? [], paging: data.paging };
  });
}
