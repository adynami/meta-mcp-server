import type { TenantContext } from '../tenant-context.js';
import { updateCampaign, updateAdSet, updateAd } from '../meta-client.js';

export const updaterTools = [
  {
    name: 'meta_update_campaign',
    description: 'Update an existing campaign. Only provide fields you want to change — all others are left untouched. Can rename, change status, adjust budget, or change bid strategy. This is a write operation — confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID to update' },
        name: { type: 'string', description: 'New campaign name' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], description: 'New status' },
        daily_budget: {
          type: 'number',
          minimum: 1,
          description: 'New daily budget in major currency units (e.g. 50 for $50). Internally converted to cents. Cannot switch between daily and lifetime — must match the campaign\'s current budget type.',
        },
        lifetime_budget: {
          type: 'number',
          minimum: 1,
          description: 'New lifetime budget in major currency units. Cannot switch between daily and lifetime.',
        },
        bid_strategy: {
          type: 'string',
          enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'],
          description: 'New bid strategy (CBO campaigns)',
        },
        special_ad_categories: {
          type: 'array',
          items: { type: 'string', enum: ['CREDIT', 'EMPLOYMENT', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS'] },
          description: 'Declare special ad categories if the campaign now covers regulated content (credit, housing, employment, politics). Pass an empty array [] to clear.',
        },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'meta_update_adset',
    description: 'Update an existing ad set. Only provide fields you want to change. Can adjust budget, bid, targeting, end date, or status. Targeting replacement is full — provide the complete targeting object. This is a write operation — confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'Ad set ID to update' },
        name: { type: 'string', description: 'New ad set name' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], description: 'New status' },
        daily_budget: { type: 'number', minimum: 1, description: 'New daily budget in major currency units' },
        lifetime_budget: { type: 'number', minimum: 1, description: 'New lifetime budget in major currency units' },
        bid_strategy: {
          type: 'string',
          enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'],
          description: 'New bid strategy (ABO ad sets)',
        },
        bid_amount: {
          type: 'number',
          minimum: 0.01,
          description: 'New bid cap or cost cap in major currency units. Required when using LOWEST_COST_WITH_BID_CAP or COST_CAP.',
        },
        end_time: { type: 'string', description: 'New end time in ISO 8601 format (e.g. 2025-12-31T23:59:59Z). Required for lifetime budget ad sets.' },
        targeting: {
          type: 'object',
          description: 'Replace the full targeting spec. Note: the Meta API replaces the entire targeting object — partial updates are not supported.',
          properties: {
            age_min: { type: 'number', minimum: 18, maximum: 65 },
            age_max: { type: 'number', minimum: 18, maximum: 65 },
            genders: { type: 'array', items: { type: 'number', enum: [0, 1, 2] }, description: '0=All, 1=Male, 2=Female' },
            geo_locations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' }, description: '2-letter ISO country codes' },
              },
            },
            custom_audiences: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Audience ID' },
                  exclusion: { type: 'boolean', description: 'Set true to EXCLUDE this audience instead of include it' },
                },
              },
              description: 'Custom audiences to include or exclude. Each entry: { id: "...", exclusion?: true }',
            },
            interests: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              description: 'Interest targeting — use meta_search_targeting to find IDs',
            },
            behaviors: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              description: 'Behavior targeting — use meta_search_targeting to find IDs',
            },
            placements: {
              type: 'object',
              description: 'Manual placement control. Omit to use Advantage+ Placements.',
              properties: {
                publisher_platforms: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram', 'audience_network', 'messenger', 'threads'] } },
                facebook_positions: { type: 'array', items: { type: 'string', enum: ['feed', 'story', 'marketplace', 'video_feeds', 'right_hand_column', 'reels', 'instream_video', 'search'] } },
                instagram_positions: { type: 'array', items: { type: 'string', enum: ['stream', 'story', 'reels', 'explore', 'explore_home'] } },
                audience_network_positions: { type: 'array', items: { type: 'string', enum: ['classic', 'instream_video'] } },
                messenger_positions: { type: 'array', items: { type: 'string', enum: ['messenger_home', 'story'] } },
                threads_positions: { type: 'array', items: { type: 'string', enum: ['feed'] }, description: 'Threads placements (requires publisher_platforms to include "threads")' },
              },
            },
          },
        },
        ad_schedule: {
          type: 'array',
          description: 'Replace dayparting schedule. Requires lifetime budget on the ad set. Each entry: { days: [0-6], start_minute: 0-1439, end_minute: 1-1440 } where 0=Sunday, minutes from midnight.',
          items: {
            type: 'object',
            properties: {
              days: { type: 'array', items: { type: 'number', enum: [0, 1, 2, 3, 4, 5, 6] } },
              start_minute: { type: 'number', minimum: 0, maximum: 1439 },
              end_minute: { type: 'number', minimum: 1, maximum: 1440 },
            },
            required: ['days', 'start_minute', 'end_minute'],
          },
        },
        destination_type: {
          type: 'string',
          enum: ['WEBSITE', 'MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT', 'PHONE_CALL', 'APP', 'ON_AD'],
          description: 'Update where users land after clicking the ad',
        },
        attribution_spec: {
          type: 'array',
          description: 'Override attribution windows for this ad set. Each entry specifies an event type and window. Example: [{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]',
          items: {
            type: 'object',
            properties: {
              event_type: { type: 'string', enum: ['CLICK_THROUGH', 'VIEW_THROUGH', 'ENGAGED_VIEW_THROUGH'] },
              window_days: { type: 'number', enum: [1, 7, 28], description: '1, 7, or 28 days' },
            },
            required: ['event_type', 'window_days'],
          },
        },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'meta_update_ad',
    description: 'Update an existing ad — rename it or change its status. Creative changes (image, copy, URL) require creating a new ad — Meta creatives are immutable. This is a write operation — confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'Ad ID to update' },
        name: { type: 'string', description: 'New ad name' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'], description: 'New status' },
      },
      required: ['ad_id'],
    },
  },
];

export async function handleUpdaterTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_update_campaign': return handleUpdateCampaign(ctx, args);
    case 'meta_update_adset': return handleUpdateAdSet(ctx, args);
    case 'meta_update_ad': return handleUpdateAd(ctx, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleUpdateCampaign(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {};
  if (args.name) params.name = args.name;
  if (args.status) params.status = args.status;
  if (args.daily_budget != null) params.daily_budget = Math.round(args.daily_budget * 100).toString();
  if (args.lifetime_budget != null) params.lifetime_budget = Math.round(args.lifetime_budget * 100).toString();
  if (args.bid_strategy) params.bid_strategy = args.bid_strategy;
  if (args.special_ad_categories != null) params.special_ad_categories = args.special_ad_categories;

  if (Object.keys(params).length === 0) {
    return { success: false, error: 'No fields to update were provided.' };
  }

  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated update campaign ${args.campaign_id}`, changes: params };
  }

  await updateCampaign(ctx, args.campaign_id, params);
  return { success: true, campaign_id: args.campaign_id, updated: summarizeChanges(args, params) };
}

async function handleUpdateAdSet(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {};
  if (args.name) params.name = args.name;
  if (args.status) params.status = args.status;
  if (args.daily_budget != null) params.daily_budget = Math.round(args.daily_budget * 100).toString();
  if (args.lifetime_budget != null) params.lifetime_budget = Math.round(args.lifetime_budget * 100).toString();
  if (args.bid_strategy) params.bid_strategy = args.bid_strategy;
  if (args.bid_amount != null) params.bid_amount = Math.round(args.bid_amount * 100).toString();
  if (args.end_time) params.end_time = args.end_time;

  if (args.targeting) {
    const t = args.targeting;
    const targeting: Record<string, any> = {};
    if (t.age_min != null) targeting.age_min = t.age_min;
    if (t.age_max != null) targeting.age_max = t.age_max;
    if (t.genders) targeting.genders = t.genders;
    if (t.geo_locations) {
      targeting.geo_locations = {
        countries: t.geo_locations.countries ?? ['US'],
        location_types: ['home', 'recent'],
      };
    }
    if (t.custom_audiences?.length) {
      const inclusions = t.custom_audiences.filter((a: any) => !a.exclusion);
      const exclusions = t.custom_audiences.filter((a: any) => a.exclusion);
      if (inclusions.length) targeting.custom_audiences = inclusions.map((a: any) => ({ id: a.id }));
      if (exclusions.length) targeting.excluded_custom_audiences = exclusions.map((a: any) => ({ id: a.id }));
    }
    if (t.interests?.length || t.behaviors?.length) {
      const spec: Record<string, any> = {};
      if (t.interests?.length) spec.interests = t.interests.map((i: any) => ({ id: i.id }));
      if (t.behaviors?.length) spec.behaviors = t.behaviors.map((b: any) => ({ id: b.id }));
      targeting.flexible_spec = [spec];
    }
    if (t.placements) {
      const p = t.placements;
      if (p.publisher_platforms?.length) targeting.publisher_platforms = p.publisher_platforms;
      if (p.facebook_positions?.length) targeting.facebook_positions = p.facebook_positions;
      if (p.instagram_positions?.length) targeting.instagram_positions = p.instagram_positions;
      if (p.audience_network_positions?.length) targeting.audience_network_positions = p.audience_network_positions;
      if (p.messenger_positions?.length) targeting.messenger_positions = p.messenger_positions;
      if (p.threads_positions?.length) targeting.threads_positions = p.threads_positions;
    }
    params.targeting = targeting;
  }

  if (args.ad_schedule?.length) params.adset_schedule = args.ad_schedule;
  if (args.destination_type) params.destination_type = args.destination_type;
  if (args.attribution_spec?.length) params.attribution_spec = args.attribution_spec;

  if (Object.keys(params).length === 0) {
    return { success: false, error: 'No fields to update were provided.' };
  }

  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated update adset ${args.adset_id}`, changes: Object.keys(params) };
  }

  await updateAdSet(ctx, args.adset_id, params);
  return { success: true, adset_id: args.adset_id, updated: summarizeChanges(args, params) };
}

async function handleUpdateAd(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {};
  if (args.name) params.name = args.name;
  if (args.status) params.status = args.status;

  if (Object.keys(params).length === 0) {
    return { success: false, error: 'No fields to update were provided. Provide name and/or status.' };
  }

  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated update ad ${args.ad_id}`, changes: params };
  }

  await updateAd(ctx, args.ad_id, params);
  return { success: true, ad_id: args.ad_id, updated: params };
}

function summarizeChanges(args: any, params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (params.name) out.name = params.name;
  if (params.status) out.status = params.status;
  if (params.daily_budget) out.daily_budget = args.daily_budget;
  if (params.lifetime_budget) out.lifetime_budget = args.lifetime_budget;
  if (params.bid_strategy) out.bid_strategy = params.bid_strategy;
  if (params.bid_amount) out.bid_amount = args.bid_amount;
  if (params.end_time) out.end_time = params.end_time;
  if (params.targeting) out.targeting = '(replaced)';
  return out;
}
