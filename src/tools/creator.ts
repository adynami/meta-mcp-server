import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';
import {
  createCampaign, createAdSet, createAd,
  uploadAdImage, deleteCampaign, deleteAdSet,
  getAccountContext,
} from '../meta-client.js';

export const creatorTools = [
  {
    name: 'upload_ad_creative',
    description: `Upload a local image file as an ad creative. Validates file existence, size (<30MB), and file type before uploading. Returns the image hash for use in ads.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        local_file_path: { type: 'string', description: 'Absolute path to the image file (jpg, png, gif)' },
      },
      required: ['local_file_path'],
    },
  },
  {
    name: 'deploy_full_campaign',
    description: `Atomic campaign deployment: creates Campaign -> Ad Set -> Ad in sequence. If any step fails, previous steps are rolled back (deleted) automatically. Requires a previously uploaded image_hash from upload_ad_creative.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_name: { type: 'string', description: 'Name for the campaign' },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'],
          description: 'Campaign objective',
        },
        daily_budget: { type: 'number', description: 'Daily budget in major currency units (e.g., 50 for $50)' },
        targeting: {
          type: 'object',
          description: 'Targeting spec with age_min, age_max, genders, geo_locations',
          properties: {
            age_min: { type: 'number', default: 18 },
            age_max: { type: 'number', default: 65 },
            genders: { type: 'array', items: { type: 'number' }, description: '0=All, 1=Male, 2=Female' },
            geo_locations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' }, description: '2-letter country codes' },
              },
            },
          },
        },
        image_hash: { type: 'string', description: 'Image hash from upload_ad_creative' },
        page_id: { type: 'string', description: 'Facebook Page ID to run ads from' },
        ad_copy: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: 'Ad headline' },
            body: { type: 'string', description: 'Primary text / body copy' },
            link_url: { type: 'string', description: 'Destination URL' },
            call_to_action: {
              type: 'string',
              enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
              default: 'LEARN_MORE',
            },
          },
          required: ['headline', 'body', 'link_url'],
        },
        start_immediately: { type: 'boolean', default: true, description: 'Start campaign immediately or paused' },
      },
      required: ['campaign_name', 'objective', 'daily_budget', 'targeting', 'image_hash', 'page_id', 'ad_copy'],
    },
  },
];

export async function handleCreatorTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'upload_ad_creative':
      return handleUpload(args);
    case 'deploy_full_campaign':
      return handleDeploy(args);
    default:
      throw new Error(`Unknown creator tool: ${name}`);
  }
}

// ── Upload ──

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

async function handleUpload(args: any): Promise<any> {
  const filePath = args.local_file_path;

  // Validate
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB. Max: 30MB`);
  }

  if (stat.size === 0) {
    throw new Error('File is empty');
  }

  // Check dimensions with sharp if available
  let dimensionWarning: string | null = null;
  try {
    const sharp = await import('sharp');
    const metadata = await sharp.default(filePath).metadata();
    if (metadata.width && metadata.height) {
      const ratio = metadata.width / metadata.height;
      if (ratio < 0.5 || ratio > 2.0) {
        dimensionWarning = `Aspect ratio ${ratio.toFixed(2)}:1 may not display well. Recommended: 1:1 (1080x1080) or 1.91:1 (1200x628).`;
      }
    }
  } catch {
    // sharp not available, skip dimension check
  }

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated upload: ${path.basename(filePath)} (${(stat.size / 1024).toFixed(0)}KB)`,
      ...(dimensionWarning && { warning: dimensionWarning }),
    };
  }

  const result = await uploadAdImage({
    filename: filePath,
  });

  // The SDK returns images as a map { hash: { ... } }
  const images = result?._data?.images ?? result?.images;
  if (images) {
    const key = Object.keys(images)[0];
    const img = images[key];
    return {
      image_hash: img.hash,
      permalink_url: img.url ?? null,
      file_name: path.basename(filePath),
      file_size_kb: Math.round(stat.size / 1024),
      ...(dimensionWarning && { warning: dimensionWarning }),
    };
  }

  return { image_hash: result?.hash ?? 'unknown', file_name: path.basename(filePath) };
}

// ── Deploy Full Campaign ──

async function handleDeploy(args: any): Promise<any> {
  const account = await getAccountContext();
  const budgetCents = Math.round(args.daily_budget * 100);
  const status = args.start_immediately === false ? 'PAUSED' : 'ACTIVE';
  const rollbackLog: string[] = [];
  let campaignId: string | null = null;
  let adsetId: string | null = null;

  if (config.dryRun) {
    return {
      dry_run: true,
      message: 'Simulated full deployment',
      details: {
        campaign: { name: args.campaign_name, objective: args.objective, daily_budget: args.daily_budget, status },
        adset: { targeting: args.targeting },
        ad: { creative_hash: args.image_hash, copy: args.ad_copy },
      },
    };
  }

  try {
    // Step 1: Create Campaign
    const campaignResult = await createCampaign({
      name: args.campaign_name,
      objective: args.objective,
      status,
      special_ad_categories: [],
    });
    campaignId = campaignResult.id;
    rollbackLog.push(`Campaign created: ${campaignId}`);

    // Step 2: Create Ad Set
    const targeting = {
      age_min: args.targeting.age_min ?? 18,
      age_max: args.targeting.age_max ?? 65,
      genders: args.targeting.genders ?? [0],
      geo_locations: {
        countries: args.targeting.geo_locations?.countries ?? ['US'],
        location_types: ['home', 'recent'],
      },
    };

    const optimizationGoal = objectiveToOptimization(args.objective);

    const adsetResult = await createAdSet({
      campaign_id: campaignId,
      name: `${args.campaign_name} - Ad Set`,
      daily_budget: budgetCents.toString(),
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status,
    });
    adsetId = adsetResult.id;
    rollbackLog.push(`Ad Set created: ${adsetId}`);

    // Step 3: Create Ad with creative
    const cta = args.ad_copy.call_to_action ?? 'LEARN_MORE';
    const adResult = await createAd({
      adset_id: adsetId,
      name: `${args.campaign_name} - Ad`,
      status,
      creative: {
        object_story_spec: {
          page_id: args.page_id,
          link_data: {
            image_hash: args.image_hash,
            link: args.ad_copy.link_url,
            message: args.ad_copy.body,
            name: args.ad_copy.headline,
            call_to_action: { type: cta },
          },
        },
      },
    });

    return {
      success: true,
      campaign: { id: campaignId, name: args.campaign_name, status },
      adset: { id: adsetId, daily_budget: args.daily_budget, currency: account.currency },
      ad: { id: adResult.id },
      note: status === 'PAUSED' ? 'Campaign created in PAUSED state. Activate when ready.' : 'Campaign is LIVE.',
    };
  } catch (error: any) {
    // Rollback on failure
    const rollbackErrors: string[] = [];

    if (adsetId) {
      try { await deleteAdSet(adsetId); } catch (e: any) { rollbackErrors.push(`Failed to delete ad set ${adsetId}: ${e.message}`); }
    }
    if (campaignId) {
      try { await deleteCampaign(campaignId); } catch (e: any) { rollbackErrors.push(`Failed to delete campaign ${campaignId}: ${e.message}`); }
    }

    return {
      success: false,
      error: error.message ?? String(error),
      failed_at: rollbackLog.length === 0 ? 'campaign_creation' : rollbackLog.length === 1 ? 'adset_creation' : 'ad_creation',
      rollback: {
        attempted: true,
        log: rollbackLog,
        errors: rollbackErrors.length ? rollbackErrors : 'All rollbacks succeeded',
      },
    };
  }
}

function objectiveToOptimization(objective: string): string {
  switch (objective) {
    case 'OUTCOME_SALES': return 'OFFSITE_CONVERSIONS';
    case 'OUTCOME_LEADS': return 'LEAD_GENERATION';
    case 'OUTCOME_TRAFFIC': return 'LINK_CLICKS';
    case 'OUTCOME_AWARENESS': return 'REACH';
    case 'OUTCOME_ENGAGEMENT': return 'POST_ENGAGEMENT';
    case 'OUTCOME_APP_PROMOTION': return 'APP_INSTALLS';
    default: return 'LINK_CLICKS';
  }
}
