import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';
import {
  createCampaign, createAdSet, createAd,
  uploadAdImage, uploadAdVideo, deleteCampaign, deleteAdSet,
  getAccountContext,
} from '../meta-client.js';

export const creatorTools = [
  {
    name: 'meta_upload_video',
    description: `Upload a local video file to the Meta ad account for use in video ads. Validates file type (mp4/mov/avi/mkv) and size (<4GB, but keep under 1GB for best results). Returns a video_id needed by meta_deploy_campaign when using creative_type=video. Meta processes the video asynchronously after upload — allow ~5 minutes before using it in an ad.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        local_file_path: { type: 'string', description: 'Absolute path to the video file on disk' },
      },
      required: ['local_file_path'],
    },
  },
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
            interests: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              description: 'Interest targeting — use meta_search_targeting to find IDs. Example: [{ "id": "6003107902433", "name": "Fitness" }]',
            },
            behaviors: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              description: 'Behavior targeting — use meta_search_targeting to find IDs. Example: [{ "id": "6002714895372", "name": "Frequent travelers" }]',
            },
            custom_audiences: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' } } },
              description: 'Custom audience IDs to include. Example: [{ "id": "12345678" }]',
            },
            excluded_custom_audiences: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' } } },
              description: 'Custom audience IDs to exclude (suppression lists). Example: [{ "id": "12345678" }]',
            },
            placements: {
              type: 'object',
              description: 'Manual placement control. Omit to use Advantage+ Placements (Meta auto-selects — recommended). Provide to restrict to specific placements.',
              properties: {
                publisher_platforms: {
                  type: 'array',
                  items: { type: 'string', enum: ['facebook', 'instagram', 'audience_network', 'messenger'] },
                  description: 'Platforms to run on (default: all)',
                },
                facebook_positions: {
                  type: 'array',
                  items: { type: 'string', enum: ['feed', 'story', 'marketplace', 'video_feeds', 'right_hand_column', 'reels', 'instream_video', 'search'] },
                  description: 'Facebook placements',
                },
                instagram_positions: {
                  type: 'array',
                  items: { type: 'string', enum: ['stream', 'story', 'reels', 'explore', 'explore_home'] },
                  description: 'Instagram placements',
                },
                audience_network_positions: {
                  type: 'array',
                  items: { type: 'string', enum: ['classic', 'instream_video'] },
                  description: 'Audience Network placements',
                },
                messenger_positions: {
                  type: 'array',
                  items: { type: 'string', enum: ['messenger_home', 'story'] },
                  description: 'Messenger placements',
                },
              },
            },
          },
        },

        // --- Schedule ---
        start_time: { type: 'string', description: 'Campaign start time in ISO 8601 format (e.g. 2025-06-01T00:00:00Z). Omit to start immediately.' },
        ad_schedule: {
          type: 'array',
          description: 'Dayparting — run ads only during specific hours/days. Requires budget_type=lifetime. Each entry specifies a time window.',
          items: {
            type: 'object',
            properties: {
              days: {
                type: 'array',
                items: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6] },
                description: '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday',
              },
              start_minute: { type: 'number', minimum: 0, maximum: 1439, description: 'Minutes from midnight (0=12:00am, 480=8:00am, 540=9:00am, 720=noon, 1020=5:00pm, 1200=8:00pm)' },
              end_minute: { type: 'number', minimum: 1, maximum: 1440, description: 'Minutes from midnight (exclusive end, max 1440=midnight)' },
            },
            required: ['days', 'start_minute', 'end_minute'],
          },
        },

        // --- Creative ---
        creative_type: {
          type: 'string',
          enum: ['image', 'video', 'carousel'],
          description: 'image (default): single image ad using image_hash. video: single video ad using video_id. carousel: multi-card ad using cards array (2–10 cards).',
        },
        image_hash: { type: 'string', description: 'Image hash from meta_upload_image. Required for creative_type=image (default).' },
        video_id: { type: 'string', description: 'Video ID from meta_upload_video. Required for creative_type=video.' },
        cards: {
          type: 'array',
          description: 'Carousel cards. Required for creative_type=carousel. Minimum 2, maximum 10 cards.',
          minItems: 2,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              image_hash: { type: 'string', description: 'Image hash for this card (from meta_upload_image)' },
              headline: { type: 'string', description: 'Card headline (shown below the card image)' },
              link_url: { type: 'string', description: 'Destination URL when this card is clicked' },
              description: { type: 'string', description: 'Optional card description (shown below headline)' },
              call_to_action: {
                type: 'string',
                enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
                description: 'CTA for this card (default: LEARN_MORE)',
              },
            },
            required: ['image_hash', 'headline', 'link_url'],
          },
        },
        page_id: { type: 'string', description: 'Facebook Page ID to run ads from' },
        ad_copy: {
          type: 'object',
          description: 'Ad copy for image and video creatives. Also used as the primary text (message) above the carousel.',
          properties: {
            headline: { type: 'string', description: 'Ad headline (shown below image/video). Not used for carousel — each card has its own headline.' },
            body: { type: 'string', description: 'Primary text (shown above the creative)' },
            link_url: { type: 'string', description: 'Destination URL when ad is clicked. For carousel, used as the fallback/see-more URL.' },
            call_to_action: {
              type: 'string',
              enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
              description: 'CTA button text (default: LEARN_MORE)',
            },
          },
          required: ['body', 'link_url'],
        },
        pixel_id: { type: 'string', description: 'Meta Pixel ID for conversion tracking. Required for OUTCOME_SALES and OUTCOME_LEADS. Use meta_list_pixels to find your pixel ID.' },
        use_advantage_audience: { type: 'boolean', description: 'Set to true to enable Meta Advantage+ audience targeting. Default: false.' },
        start_immediately: { type: 'boolean', description: 'true = ACTIVE, false = PAUSED (default: true)' },
      },
      required: ['campaign_name', 'objective', 'daily_budget', 'targeting', 'page_id', 'ad_copy'],
    },
  },
];

export async function handleCreatorTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_upload_image': return handleUpload(args);
    case 'meta_upload_video': return handleVideoUpload(args);
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

const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.wmv'];
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

async function handleVideoUpload(args: any): Promise<any> {
  const filePath = args.local_file_path;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Provide an absolute path to an existing video file.`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type "${ext}". Use one of: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_VIDEO_SIZE) {
    throw new Error(`File is ${(stat.size / 1024 / 1024 / 1024).toFixed(2)}GB, max is 4GB.`);
  }
  if (stat.size === 0) {
    throw new Error('File is empty (0 bytes).');
  }

  const sizeWarning = stat.size > 1024 * 1024 * 1024
    ? `File is ${(stat.size / 1024 / 1024 / 1024).toFixed(2)}GB — upload may take a while.`
    : null;

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated video upload: ${path.basename(filePath)} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`,
      ...(sizeWarning && { warning: sizeWarning }),
    };
  }

  const result = await uploadAdVideo(filePath);
  return {
    video_id: result.video_id,
    note: 'Meta processes videos asynchronously. Allow ~5 minutes before using in an ad.',
    ...(sizeWarning && { warning: sizeWarning }),
  };
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
  if (args.ad_schedule?.length && budgetType !== 'lifetime') {
    return { success: false, error: 'ad_schedule (dayparting) requires budget_type=lifetime. Meta only supports dayparting on lifetime budget campaigns.' };
  }
  if ((args.objective === 'OUTCOME_SALES' || args.objective === 'OUTCOME_LEADS') && !args.pixel_id) {
    return { success: false, error: `pixel_id is required for objective ${args.objective}. Use meta_list_pixels to find your pixel ID, then pass it as pixel_id.` };
  }

  // Validate creative inputs
  const creativeType = (args.creative_type ?? 'image') as 'image' | 'video' | 'carousel';
  if (creativeType === 'image' && !args.image_hash) {
    return { success: false, error: 'image_hash is required for creative_type=image (default). Get one from meta_upload_image.' };
  }
  if (creativeType === 'video' && !args.video_id) {
    return { success: false, error: 'video_id is required for creative_type=video. Get one from meta_upload_video.' };
  }
  if (creativeType === 'carousel') {
    if (!args.cards?.length || args.cards.length < 2) {
      return { success: false, error: 'carousel requires at least 2 cards. Provide a cards array with image_hash, headline, and link_url for each card.' };
    }
    if (args.cards.length > 10) {
      return { success: false, error: 'carousel supports a maximum of 10 cards.' };
    }
  }

  if (config.dryRun) {
    return {
      dry_run: true,
      message: 'Simulated deployment',
      campaign_name: args.campaign_name,
      objective: args.objective,
      creative_type: creativeType,
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
    if (args.start_time) campaignParams.start_time = args.start_time;
    if (budgetType === 'lifetime' && args.end_time) campaignParams.stop_time = args.end_time;

    const campaignResult = await createCampaign(campaignParams);
    campaignId = campaignResult.id;
    steps.push(`Campaign ${campaignId}`);

    const useAdvantageAudience = args.use_advantage_audience === true;

    const t = args.targeting;
    const targeting: Record<string, any> = {
      age_min: t.age_min ?? 18,
      age_max: t.age_max ?? 65,
      genders: t.genders ?? [0],
      geo_locations: { countries: t.geo_locations?.countries ?? ['US'], location_types: ['home', 'recent'] },
      targeting_automation: { advantage_audience: useAdvantageAudience ? 1 : 0 },
    };

    // Interest / behavior targeting via flexible_spec
    if (t.interests?.length || t.behaviors?.length) {
      const spec: Record<string, any> = {};
      if (t.interests?.length) spec.interests = t.interests.map((i: any) => ({ id: i.id }));
      if (t.behaviors?.length) spec.behaviors = t.behaviors.map((b: any) => ({ id: b.id }));
      targeting.flexible_spec = [spec];
    }

    // Custom audience include / exclude
    if (t.custom_audiences?.length) targeting.custom_audiences = t.custom_audiences.map((a: any) => ({ id: a.id }));
    if (t.excluded_custom_audiences?.length) targeting.excluded_custom_audiences = t.excluded_custom_audiences.map((a: any) => ({ id: a.id }));

    // Manual placements (omitting lets Meta use Advantage+ Placements)
    if (t.placements) {
      const p = t.placements;
      if (p.publisher_platforms?.length) targeting.publisher_platforms = p.publisher_platforms;
      if (p.facebook_positions?.length) targeting.facebook_positions = p.facebook_positions;
      if (p.instagram_positions?.length) targeting.instagram_positions = p.instagram_positions;
      if (p.audience_network_positions?.length) targeting.audience_network_positions = p.audience_network_positions;
      if (p.messenger_positions?.length) targeting.messenger_positions = p.messenger_positions;
    }

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
      if (budgetType === 'lifetime' && args.end_time) adsetParams.end_time = args.end_time;
    } else {
      // CBO: ad set opts in to campaign budget sharing
      adsetParams.is_adset_budget_sharing_enabled = true;
    }

    if (args.start_time) adsetParams.start_time = args.start_time;
    if (args.ad_schedule?.length) adsetParams.adset_schedule = args.ad_schedule;

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

    // OUTCOME_SALES / OUTCOME_LEADS require a pixel + conversion event on the ad set
    if (args.objective === 'OUTCOME_SALES') {
      adsetParams.promoted_object = {
        pixel_id: args.pixel_id,
        custom_event_type: 'PURCHASE',
      };
    } else if (args.objective === 'OUTCOME_LEADS') {
      adsetParams.promoted_object = {
        pixel_id: args.pixel_id,
        custom_event_type: 'LEAD',
      };
    }

    const adsetResult = await createAdSet(adsetParams);
    adsetId = adsetResult.id;
    steps.push(`Ad Set ${adsetId}`);

    const objectStorySpec = buildObjectStorySpec(creativeType, args);
    const adResult = await createAd({
      adset_id: adsetId,
      name: `${args.campaign_name} - Ad`,
      status,
      creative: { object_story_spec: objectStorySpec },
    });

    return {
      success: true,
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: adResult.id,
      status,
      creative_type: creativeType,
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

function buildObjectStorySpec(creativeType: 'image' | 'video' | 'carousel', args: any): Record<string, any> {
  const cta = args.ad_copy.call_to_action ?? 'LEARN_MORE';

  if (creativeType === 'video') {
    return {
      page_id: args.page_id,
      video_data: {
        video_id: args.video_id,
        message: args.ad_copy.body,
        title: args.ad_copy.headline ?? '',
        call_to_action: {
          type: cta,
          value: { link: args.ad_copy.link_url },
        },
      },
    };
  }

  if (creativeType === 'carousel') {
    return {
      page_id: args.page_id,
      link_data: {
        message: args.ad_copy.body,
        link: args.ad_copy.link_url,
        child_attachments: args.cards.map((card: any) => ({
          link: card.link_url,
          name: card.headline,
          ...(card.description && { description: card.description }),
          image_hash: card.image_hash,
          call_to_action: { type: card.call_to_action ?? 'LEARN_MORE' },
        })),
      },
    };
  }

  // Default: image
  return {
    page_id: args.page_id,
    link_data: {
      image_hash: args.image_hash,
      link: args.ad_copy.link_url,
      message: args.ad_copy.body,
      name: args.ad_copy.headline ?? '',
      call_to_action: { type: cta },
    },
  };
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
