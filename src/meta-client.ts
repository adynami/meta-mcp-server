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
  const account = getAdAccount();
  return rateLimitedCall(() => account.createCampaign([], params));
}

export async function createAdSet(params: Record<string, any>): Promise<any> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.createAdSet([], params));
}

export async function createAd(params: Record<string, any>): Promise<any> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.createAd([], params));
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
