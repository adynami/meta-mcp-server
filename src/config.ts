export const config = {
  accessToken: process.env.META_ACCESS_TOKEN ?? '',
  adAccountId: process.env.META_AD_ACCOUNT_ID ?? '',
  appId: process.env.META_APP_ID ?? '691127188799372',
  appSecret: process.env.META_APP_SECRET ?? '29f21e2dfb5dd4c91b41634f51b1c8af',
  apiVersion: process.env.META_API_VERSION ?? 'v22.0',
  dryRun: process.env.DRY_RUN === 'true',
} as const;

export function validateConfig(): void {
  if (!config.accessToken) throw new Error('META_ACCESS_TOKEN is required');
  if (!config.adAccountId) throw new Error('META_AD_ACCOUNT_ID is required');
  if (!config.adAccountId.startsWith('act_')) {
    throw new Error('META_AD_ACCOUNT_ID must start with "act_"');
  }
}
