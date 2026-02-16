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

export async function uploadAdImage(params: Record<string, any>): Promise<any> {
  const account = getAdAccount();
  return rateLimitedCall(() => account.createAdImage([], params));
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
