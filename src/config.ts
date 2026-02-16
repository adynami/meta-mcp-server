export const config = {
  accessToken: process.env.META_ACCESS_TOKEN ?? '',
  adAccountId: process.env.META_AD_ACCOUNT_ID ?? '',
  appId: process.env.META_APP_ID ?? 'REDACTED_APP_ID',
  appSecret: process.env.META_APP_SECRET ?? 'REDACTED_APP_SECRET',
  apiVersion: process.env.META_API_VERSION ?? 'v19.0',
  dryRun: process.env.DRY_RUN === 'true',
} as const;

export function validateConfig(): void {
  if (!config.accessToken) throw new Error('META_ACCESS_TOKEN is required');
  if (!config.adAccountId) throw new Error('META_AD_ACCOUNT_ID is required');
  if (!config.adAccountId.startsWith('act_')) {
    throw new Error('META_AD_ACCOUNT_ID must start with "act_"');
  }
}
