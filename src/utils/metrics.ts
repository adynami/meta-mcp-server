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
  let count = 0;
  let value = 0;

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

  return { count, value };
}

export function computeMetrics(row: RawInsightRow): ComputedMetrics {
  const impressions = num(row.impressions);
  const clicks = num(row.clicks);
  const spend = num(row.spend);
  const frequency = num(row.frequency);
  const reach = num(row.reach);
  const { count: conversions, value: conversion_value } = extractConversions(row);

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
