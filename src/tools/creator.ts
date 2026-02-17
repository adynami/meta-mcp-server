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
    name: 'meta_upload_image',
    description: `Upload a local image file to the Meta ad account for use in ads. Use when the user wants to create an ad and has an image file ready. Validates file type (jpg/png/gif/webp), size (<30MB), and aspect ratio before uploading. Returns an image_hash needed by meta_deploy_campaign.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        local_file_path: { type: 'string', description: 'Absolute path to the image file on disk' },
      },
      required: ['local_file_path'],
    },
  },
  {
    name: 'meta_deploy_campaign',
    description: `Create a complete campaign in one step: Campaign + Ad Set + Ad. Use when the user wants to launch a new campaign. This is an atomic operation — if any step fails, all previous steps are rolled back automatically (no zombie campaigns). Requires an image_hash from meta_upload_image. This is a write operation — confirm details with the user before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_name: { type: 'string', description: 'Display name for the campaign' },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'],
          description: 'Campaign objective. Use OUTCOME_SALES for purchase optimization, OUTCOME_TRAFFIC for link clicks.',
        },
        daily_budget: { type: 'number', minimum: 1, description: 'Daily budget in major currency units (e.g., 50 for $50)' },
        targeting: {
          type: 'object',
          description: 'Audience targeting specification',
          properties: {
            age_min: { type: 'number', minimum: 18, maximum: 65, description: 'Minimum age (default 18)' },
            age_max: { type: 'number', minimum: 18, maximum: 65, description: 'Maximum age (default 65)' },
            genders: { type: 'array', items: { type: 'number', enum: [0, 1, 2] }, description: '0=All, 1=Male, 2=Female (default [0])' },
            geo_locations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 2 }, description: '2-letter ISO country codes (default ["US"])' },
              },
            },
          },
        },
        image_hash: { type: 'string', description: 'Image hash from meta_upload_image' },
        page_id: { type: 'string', description: 'Facebook Page ID to run ads from' },
        ad_copy: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: 'Ad headline (shown below image)' },
            body: { type: 'string', description: 'Primary text (shown above image)' },
            link_url: { type: 'string', description: 'Destination URL when ad is clicked' },
            call_to_action: {
              type: 'string',
              enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
              description: 'CTA button text (default: LEARN_MORE)',
            },
          },
          required: ['headline', 'body', 'link_url'],
        },
        start_immediately: { type: 'boolean', description: 'true = ACTIVE, false = PAUSED (default: true)' },
      },
      required: ['campaign_name', 'objective', 'daily_budget', 'targeting', 'image_hash', 'page_id', 'ad_copy'],
    },
  },
];

export async function handleCreatorTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_upload_image': return handleUpload(args);
    case 'meta_deploy_campaign': return handleDeploy(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const MAX_FILE_SIZE = 30 * 1024 * 1024;

async function handleUpload(args: any): Promise<any> {
  const filePath = args.local_file_path;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Provide an absolute path to an existing image file.`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type "${ext}". Use one of: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File is ${(stat.size / 1024 / 1024).toFixed(1)}MB, max is 30MB. Compress or resize the image.`);
  }
  if (stat.size === 0) {
    throw new Error('File is empty (0 bytes).');
  }

  let dimensionWarning: string | null = null;
  try {
    const sharp = await import('sharp');
    const metadata = await sharp.default(filePath).metadata();
    if (metadata.width && metadata.height) {
      const ratio = metadata.width / metadata.height;
      if (ratio < 0.5 || ratio > 2.0) {
        dimensionWarning = `Aspect ratio ${ratio.toFixed(2)}:1 — may crop poorly. Recommended: 1:1 or 1.91:1.`;
      }
    }
  } catch { /* sharp not available */ }

  if (config.dryRun) {
    return { dry_run: true, message: `Simulated upload: ${path.basename(filePath)} (${(stat.size / 1024).toFixed(0)}KB)`, ...(dimensionWarning && { warning: dimensionWarning }) };
  }

  const result = await uploadAdImage(filePath);
  return { image_hash: result.hash, ...(dimensionWarning && { warning: dimensionWarning }) };
}

async function handleDeploy(args: any): Promise<any> {
  const account = await getAccountContext();
  const budgetCents = Math.round(args.daily_budget * 100);
  const status = args.start_immediately === false ? 'PAUSED' : 'ACTIVE';
  const steps: string[] = [];
  let campaignId: string | null = null;
  let adsetId: string | null = null;

  if (config.dryRun) {
    return { dry_run: true, message: 'Simulated deployment', campaign_name: args.campaign_name, objective: args.objective, daily_budget: `${account.currency} ${args.daily_budget}`, status };
  }

  try {
    const campaignResult = await createCampaign({ name: args.campaign_name, objective: args.objective, status, special_ad_categories: [] });
    campaignId = campaignResult.id;
    steps.push(`Campaign ${campaignId}`);

    const targeting = {
      age_min: args.targeting.age_min ?? 18,
      age_max: args.targeting.age_max ?? 65,
      genders: args.targeting.genders ?? [0],
      geo_locations: { countries: args.targeting.geo_locations?.countries ?? ['US'], location_types: ['home', 'recent'] },
    };

    const adsetResult = await createAdSet({
      campaign_id: campaignId,
      name: `${args.campaign_name} - Ad Set`,
      daily_budget: budgetCents.toString(),
      billing_event: 'IMPRESSIONS',
      optimization_goal: objectiveToOptimization(args.objective),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status,
    });
    adsetId = adsetResult.id;
    steps.push(`Ad Set ${adsetId}`);

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
            call_to_action: { type: args.ad_copy.call_to_action ?? 'LEARN_MORE' },
          },
        },
      },
    });

    return {
      success: true,
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: adResult.id,
      status,
      budget: `${account.currency} ${args.daily_budget}/day`,
    };
  } catch (error: any) {
    const rollbackErrors: string[] = [];
    if (adsetId) { try { await deleteAdSet(adsetId); } catch (e: any) { rollbackErrors.push(e.message); } }
    if (campaignId) { try { await deleteCampaign(campaignId); } catch (e: any) { rollbackErrors.push(e.message); } }

    return {
      success: false,
      error: error.message ?? String(error),
      failed_at: steps.length === 0 ? 'campaign' : steps.length === 1 ? 'adset' : 'ad',
      rolled_back: rollbackErrors.length === 0,
      ...(rollbackErrors.length && { rollback_errors: rollbackErrors }),
    };
  }
}

function objectiveToOptimization(objective: string): string {
  const map: Record<string, string> = {
    OUTCOME_SALES: 'OFFSITE_CONVERSIONS',
    OUTCOME_LEADS: 'LEAD_GENERATION',
    OUTCOME_TRAFFIC: 'LINK_CLICKS',
    OUTCOME_AWARENESS: 'REACH',
    OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
    OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
  };
  return map[objective] ?? 'LINK_CLICKS';
}
