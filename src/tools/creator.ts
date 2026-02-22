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
    description: `Create a complete campaign in one step: Campaign + Ad Set + Ad. Supports all Meta budget modes (CBO/ABO), bid strategies (lowest cost, bid cap, cost cap, min ROAS), and daily/lifetime budgets. This is an atomic operation — if any step fails, all previous steps are rolled back automatically (no zombie campaigns). Requires an image_hash from meta_upload_image. This is a write operation — confirm details with the user before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_name: { type: 'string', description: 'Display name for the campaign' },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'],
          description: 'Campaign objective. Use OUTCOME_SALES for purchase optimization, OUTCOME_TRAFFIC for link clicks.',
        },

        // --- Budget level ---
        budget_level: {
          type: 'string',
          enum: ['CBO', 'ABO'],
          description: 'CBO (default) = Advantage Campaign Budget — Meta allocates one campaign-level budget across ad sets automatically. ABO = Ad Set Budget — you control budget per ad set manually. Use CBO for scaling, ABO for testing.',
        },
        budget_type: {
          type: 'string',
          enum: ['daily', 'lifetime'],
          description: 'daily (default) = spend this amount per day indefinitely. lifetime = spend this total amount over the campaign duration (requires end_time).',
        },
        daily_budget: { type: 'number', minimum: 1, description: 'Budget amount in major currency units (e.g. 50 for $50). Used as daily budget when budget_type=daily, or total lifetime budget when budget_type=lifetime.' },
        end_time: { type: 'string', description: 'Required when budget_type=lifetime. Campaign end date/time in ISO 8601 format (e.g. 2025-12-31T23:59:59Z).' },

        // --- Bid strategy ---
        bid_strategy: {
          type: 'string',
          enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'],
          description: [
            'LOWEST_COST_WITHOUT_CAP (default): Meta bids to maximise results within your budget. No bid control. Best for volume/scaling.',
            'LOWEST_COST_WITH_BID_CAP: You set a hard max bid per auction (bid_amount required). Meta will not bid above this. Best for strict CPA control with some volume sacrifice.',
            'COST_CAP: You set a target average cost per result (bid_amount required). Meta may exceed it occasionally but targets the average. Best for CPA targets with flexibility.',
            'LOWEST_COST_WITH_MIN_ROAS: You set a minimum acceptable ROAS floor (min_roas required). Meta only enters auctions expected to meet it. Best for revenue-focused campaigns.',
          ].join(' | '),
        },
        bid_amount: {
          type: 'number',
          minimum: 0.01,
          description: 'Required for LOWEST_COST_WITH_BID_CAP and COST_CAP. The bid cap or target cost per result in major currency units (e.g. 15 for $15 per purchase). Not used for LOWEST_COST_WITHOUT_CAP or LOWEST_COST_WITH_MIN_ROAS.',
        },
        min_roas: {
          type: 'number',
          minimum: 0.01,
          description: 'Required for LOWEST_COST_WITH_MIN_ROAS. Minimum acceptable return on ad spend as a multiplier (e.g. 2.5 means $2.50 revenue per $1 spent). Meta converts this internally to basis points.',
        },

        // --- Targeting ---
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

        // --- Creative ---
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
        pixel_id: { type: 'string', description: 'Meta Pixel ID for conversion tracking. Required for OUTCOME_SALES and OUTCOME_LEADS. Default: 858047089973360' },
        use_advantage_audience: { type: 'boolean', description: 'Set to true to enable Meta Advantage+ audience targeting. Set to false to use manual targeting spec. Default: false.' },
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
  const budgetLevel = (args.budget_level ?? 'CBO') as 'CBO' | 'ABO';
  const budgetType = (args.budget_type ?? 'daily') as 'daily' | 'lifetime';
  const bidStrategy = (args.bid_strategy ?? 'LOWEST_COST_WITHOUT_CAP') as string;
  const steps: string[] = [];
  let campaignId: string | null = null;
  let adsetId: string | null = null;

  // Validate bid_amount is provided when required
  if ((bidStrategy === 'LOWEST_COST_WITH_BID_CAP' || bidStrategy === 'COST_CAP') && !args.bid_amount) {
    return { success: false, error: `bid_amount is required when bid_strategy is ${bidStrategy}. Provide a value in major currency units (e.g. 15 for $15).` };
  }
  if (bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && !args.min_roas) {
    return { success: false, error: 'min_roas is required when bid_strategy is LOWEST_COST_WITH_MIN_ROAS. Provide a multiplier (e.g. 2.5 for 2.5x ROAS).' };
  }
  if (budgetType === 'lifetime' && !args.end_time) {
    return { success: false, error: 'end_time is required when budget_type is lifetime. Provide an ISO 8601 datetime (e.g. 2025-12-31T23:59:59Z).' };
  }

  if (config.dryRun) {
    return {
      dry_run: true,
      message: 'Simulated deployment',
      campaign_name: args.campaign_name,
      objective: args.objective,
      budget_level: budgetLevel,
      budget_type: budgetType,
      budget: `${account.currency} ${args.daily_budget}${budgetType === 'daily' ? '/day' : ' lifetime'}`,
      bid_strategy: bidStrategy,
      ...(args.bid_amount && { bid_amount: `${account.currency} ${args.bid_amount}` }),
      ...(args.min_roas && { min_roas: `${args.min_roas}x` }),
      status,
    };
  }

  try {
    // --- Campaign params ---
    const campaignParams: Record<string, any> = {
      name: args.campaign_name,
      objective: args.objective,
      status,
      special_ad_categories: [],
    };

    if (budgetLevel === 'CBO') {
      // CBO: budget lives on the campaign, Meta distributes across ad sets
      campaignParams[budgetType === 'daily' ? 'daily_budget' : 'lifetime_budget'] = budgetCents.toString();
      campaignParams.bid_strategy = bidStrategy;
    }

    const campaignResult = await createCampaign(campaignParams);
    campaignId = campaignResult.id;
    steps.push(`Campaign ${campaignId}`);

    const useAdvantageAudience = args.use_advantage_audience === true;

    const targeting = {
      age_min: args.targeting.age_min ?? 18,
      age_max: args.targeting.age_max ?? 65,
      genders: args.targeting.genders ?? [0],
      geo_locations: { countries: args.targeting.geo_locations?.countries ?? ['US'], location_types: ['home', 'recent'] },
      targeting_automation: { advantage_audience: useAdvantageAudience ? 1 : 0 },
    };

    // --- Ad set params ---
    const adsetParams: Record<string, any> = {
      campaign_id: campaignId,
      name: `${args.campaign_name} - Ad Set`,
      billing_event: 'IMPRESSIONS',
      optimization_goal: objectiveToOptimization(args.objective),
      targeting,
      status,
    };

    if (budgetLevel === 'ABO') {
      // ABO: budget and bid strategy live on the ad set
      adsetParams[budgetType === 'daily' ? 'daily_budget' : 'lifetime_budget'] = budgetCents.toString();
      adsetParams.bid_strategy = bidStrategy;
      if (budgetType === 'lifetime' && args.end_time) {
        adsetParams.end_time = args.end_time;
      }
    } else {
      // CBO: ad set opts in to campaign budget sharing
      adsetParams.is_adset_budget_sharing_enabled = true;
    }

    // Bid amount — required for BID_CAP and COST_CAP, on ad set regardless of CBO/ABO
    if (bidStrategy === 'LOWEST_COST_WITH_BID_CAP' || bidStrategy === 'COST_CAP') {
      adsetParams.bid_amount = Math.round(args.bid_amount * 100).toString();
    }

    // Min ROAS constraint — Meta expects integer basis points (1.0 ROAS = 10000)
    if (bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS') {
      adsetParams.bid_constraints = {
        roas_average_floor: Math.round(args.min_roas * 10000),
      };
    }

    // OUTCOME_SALES requires a pixel + conversion event on the ad set
    if (args.objective === 'OUTCOME_SALES') {
      adsetParams.promoted_object = {
        pixel_id: args.pixel_id ?? '858047089973360',
        custom_event_type: 'PURCHASE',
      };
    } else if (args.objective === 'OUTCOME_LEADS') {
      adsetParams.promoted_object = {
        pixel_id: args.pixel_id ?? '858047089973360',
        custom_event_type: 'LEAD',
      };
    }

    const adsetResult = await createAdSet(adsetParams);
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
      budget_level: budgetLevel,
      budget: `${account.currency} ${args.daily_budget}${budgetType === 'daily' ? '/day' : ' lifetime'}`,
      bid_strategy: bidStrategy,
      ...(args.bid_amount && { bid_amount: `${account.currency} ${args.bid_amount}` }),
      ...(args.min_roas && { min_roas: `${args.min_roas}x ROAS floor` }),
    };
  } catch (error: any) {
    const rollbackErrors: string[] = [];
    if (adsetId) { try { await deleteAdSet(adsetId); } catch (e: any) { rollbackErrors.push(e.message); } }
    if (campaignId) { try { await deleteCampaign(campaignId); } catch (e: any) { rollbackErrors.push(e.message); } }

    // Dump full error to stderr for debugging
    console.error('[meta-mcp] deploy_campaign error at step:', steps.length === 0 ? 'campaign' : steps.length === 1 ? 'adset' : 'ad');
    console.error('[meta-mcp] error.message:', error?.message);
    console.error('[meta-mcp] error.response:', JSON.stringify(error?.response, null, 2));
    console.error('[meta-mcp] error.response?.data:', JSON.stringify(error?.response?.data, null, 2));
    console.error('[meta-mcp] error.body:', JSON.stringify(error?.body, null, 2));
    console.error('[meta-mcp] error.data:', JSON.stringify(error?.data, null, 2));
    // FB SDK sometimes puts the error in different places
    const rawError = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}), 2);
    console.error('[meta-mcp] full error object:', rawError);

    // Try every known path the FB SDK uses to store API errors
    const fbErr =
      error?.response?.error ??         // SDK v22+
      error?.response?.data?.error ??   // axios wrapper
      error?.body?.error ??             // older SDK
      error?.data?.error ??             // direct response
      error?.error ??                   // nested
      null;

    let errorDetail: string;
    if (fbErr) {
      errorDetail = `[Meta API ${fbErr.code ?? '?'}] ${fbErr.error_user_title ?? fbErr.message ?? 'Unknown'}`;
      if (fbErr.error_user_msg) errorDetail += ` — ${fbErr.error_user_msg}`;
      if (fbErr.error_subcode) errorDetail += ` (subcode ${fbErr.error_subcode})`;
      if (fbErr.fbtrace_id) errorDetail += ` [trace: ${fbErr.fbtrace_id}]`;
    } else {
      // Last resort: include the full serialized error so nothing is hidden
      errorDetail = error?.message ?? rawError ?? String(error);
    }

    return {
      success: false,
      error: errorDetail,
      error_raw: rawError?.slice(0, 2000),  // include raw for debugging, capped at 2k chars
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
