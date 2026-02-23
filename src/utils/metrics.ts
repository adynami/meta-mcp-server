export interface RawInsightRow {
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  cpm?: string;
  frequency?: string;
  reach?: string;
  // Video engagement fields (action arrays returned by Meta)
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
  // Unique / link metrics
  unique_clicks?: string;
  unique_ctr?: string;
  outbound_clicks?: Array<{ action_type: string; value: string }>;
  outbound_clicks_ctr?: Array<{ action_type: string; value: string }>;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  // Creative quality rankings
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export interface VideoMetrics {
  views_3s: number;          // 3-second video views
  views_p25: number;         // reached 25% of video
  views_p50: number;         // reached 50%
  views_p75: number;         // reached 75%
  views_p100: number;        // completed (100%)
  avg_watch_time_sec: number;
  completion_rate: number;   // views_p100 / views_3s * 100 (%)
}

export interface ConversionBreakdown {
  [shortName: string]: number;  // e.g. purchase: 23, initiate_checkout: 87
}

export interface ConversionValueBreakdown {
  [shortName: string]: number;  // same keys, currency values
}

export interface ComputedMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  cpa: number;
  frequency: number;
  reach: number;
  unique_clicks?: number;
  unique_ctr?: number;
  outbound_clicks?: number;
  conversion_breakdown?: ConversionBreakdown;
  conversion_value_breakdown?: ConversionValueBreakdown;
  video?: VideoMetrics;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

function num(v: string | undefined): number {
  return v ? parseFloat(v) : 0;
}

function round(v: number, decimals = 2): number {
  if (!isFinite(v)) return 0;
  return Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function extractActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  if (!actions) return 0;
  for (const a of actions) {
    if (a.action_type === type) return num(a.value);
  }
  return 0;
}

function extractVideoWatched(
  arr: Array<{ action_type: string; value: string }> | undefined,
): number {
  if (!arr?.length) return 0;
  return num(arr[0].value);
}

export function extractConversions(row: RawInsightRow): { count: number; value: number } {
  const purchaseTypes = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  const leadTypes = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'];

  let count = 0;
  let value = 0;

  // Try purchase actions first
  if (row.actions) {
    for (const a of row.actions) {
      if (purchaseTypes.includes(a.action_type)) count += num(a.value);
    }
  }
  if (row.action_values) {
    for (const a of row.action_values) {
      if (purchaseTypes.includes(a.action_type)) value += num(a.value);
    }
  }

  // Fall back to lead actions — covers OUTCOME_LEADS campaigns
  if (count === 0 && row.actions) {
    for (const a of row.actions) {
      if (leadTypes.includes(a.action_type)) count += num(a.value);
    }
  }

  return { count, value };
}

// Maps offsite_conversion.fb_pixel_* action_type values to short display names.
// Ordered by funnel stage (awareness → conversion).
const PIXEL_ACTION_MAP: Record<string, string> = {
  'offsite_conversion.fb_pixel_view_content':         'view_content',
  'offsite_conversion.fb_pixel_search':               'search',
  'offsite_conversion.fb_pixel_add_to_wishlist':      'add_to_wishlist',
  'offsite_conversion.fb_pixel_add_to_cart':          'add_to_cart',
  'offsite_conversion.fb_pixel_initiate_checkout':    'initiate_checkout',
  'offsite_conversion.fb_pixel_add_payment_info':     'add_payment_info',
  'offsite_conversion.fb_pixel_purchase':             'purchase',
  'offsite_conversion.fb_pixel_lead':                 'lead',
  'offsite_conversion.fb_pixel_complete_registration':'complete_registration',
  'offsite_conversion.fb_pixel_custom':               'custom_event',
  // Aggregate / omnichannel types — include only when no granular pixel type present
  'omni_purchase':                    'omni_purchase',
  'omni_add_to_cart':                 'omni_add_to_cart',
  'lead':                             'lead_form',
  'onsite_conversion.lead_grouped':   'lead_onsite',
  'leadgen_grouped':                  'lead_gen',
};

/**
 * Extract a per-event-type conversion breakdown from the actions / action_values arrays.
 * Returns only non-zero entries, keyed by short display names.
 * Omits aggregate types (omni_*, lead_form, etc.) when the granular pixel type is also present.
 */
export function extractActionBreakdown(row: RawInsightRow): {
  counts: ConversionBreakdown;
  values: ConversionValueBreakdown;
} {
  const counts: ConversionBreakdown = {};
  const values: ConversionValueBreakdown = {};

  if (row.actions) {
    for (const a of row.actions) {
      const short = PIXEL_ACTION_MAP[a.action_type];
      if (!short) continue;
      const v = num(a.value);
      if (v > 0) counts[short] = (counts[short] ?? 0) + v;
    }
  }

  if (row.action_values) {
    for (const a of row.action_values) {
      const short = PIXEL_ACTION_MAP[a.action_type];
      if (!short) continue;
      const v = num(a.value);
      if (v > 0) values[short] = (values[short] ?? 0) + v;
    }
  }

  // Deduplicate: if granular pixel purchase is present, drop omni_purchase
  if ('purchase' in counts && 'omni_purchase' in counts) delete counts.omni_purchase;
  if ('purchase' in values && 'omni_purchase' in values) delete values.omni_purchase;
  if ('add_to_cart' in counts && 'omni_add_to_cart' in counts) delete counts.omni_add_to_cart;
  if ('add_to_cart' in values && 'omni_add_to_cart' in values) delete values.omni_add_to_cart;
  if ('lead' in counts && 'lead_form' in counts) delete counts.lead_form;
  if ('lead' in counts && 'lead_onsite' in counts) delete counts.lead_onsite;
  if ('lead' in counts && 'lead_gen' in counts) delete counts.lead_gen;

  return { counts, values };
}

export function computeMetrics(row: RawInsightRow): ComputedMetrics {
  const impressions = num(row.impressions);
  const clicks = num(row.clicks);
  const spend = num(row.spend);
  const frequency = num(row.frequency);
  const reach = num(row.reach);
  const { count: conversions, value: conversion_value } = extractConversions(row);
  const { counts: convBreakdown, values: convValueBreakdown } = extractActionBreakdown(row);
  const hasBreakdown = Object.keys(convBreakdown).length > 0;
  const hasValueBreakdown = Object.keys(convValueBreakdown).length > 0;

  // Video metrics — 3-second views live in the actions array
  const video_views = extractActionValue(row.actions, 'video_view');
  const video_p25 = extractVideoWatched(row.video_p25_watched_actions);
  const video_p50 = extractVideoWatched(row.video_p50_watched_actions);
  const video_p75 = extractVideoWatched(row.video_p75_watched_actions);
  const video_p100 = extractVideoWatched(row.video_p100_watched_actions);
  const video_avg = extractVideoWatched(row.video_avg_time_watched_actions);

  const hasVideo = video_views > 0 || video_p100 > 0;
  const video: VideoMetrics | undefined = hasVideo ? {
    views_3s: video_views,
    views_p25: video_p25,
    views_p50: video_p50,
    views_p75: video_p75,
    views_p100: video_p100,
    avg_watch_time_sec: round(video_avg),
    completion_rate: round(video_views > 0 ? (video_p100 / video_views) * 100 : 0),
  } : undefined;

  const unique_clicks = row.unique_clicks ? num(row.unique_clicks) : undefined;
  const unique_ctr = row.unique_ctr ? num(row.unique_ctr) : undefined;
  const outbound_clicks = row.outbound_clicks?.length ? num(row.outbound_clicks[0].value) : undefined;

  return {
    impressions,
    clicks,
    spend: round(spend),
    ctr: round(clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0),
    cpc: round(clicks > 0 ? spend / clicks : 0),
    cpm: round(impressions > 0 ? (spend / impressions) * 1000 : 0),
    conversions,
    conversion_value: round(conversion_value),
    roas: round(spend > 0 ? conversion_value / spend : 0),
    cpa: round(conversions > 0 ? spend / conversions : 0),
    frequency: round(frequency),
    reach,
    ...(unique_clicks != null && unique_clicks > 0 && { unique_clicks }),
    ...(unique_ctr != null && unique_ctr > 0 && { unique_ctr: round(unique_ctr) }),
    ...(outbound_clicks != null && outbound_clicks > 0 && { outbound_clicks }),
    ...(hasBreakdown && { conversion_breakdown: convBreakdown }),
    ...(hasValueBreakdown && { conversion_value_breakdown: convValueBreakdown }),
    ...(video && { video }),
    ...(row.quality_ranking && { quality_ranking: row.quality_ranking }),
    ...(row.engagement_rate_ranking && { engagement_rate_ranking: row.engagement_rate_ranking }),
    ...(row.conversion_rate_ranking && { conversion_rate_ranking: row.conversion_rate_ranking }),
  };
}

export function pctChange(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '0%';
  if (previous === 0) return '+∞%';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${round(change, 1)}%`;
}
