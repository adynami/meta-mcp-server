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
}

function num(v: string | undefined): number {
  return v ? parseFloat(v) : 0;
}

function round(v: number, decimals = 2): number {
  if (!isFinite(v)) return 0;
  return Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function extractConversions(row: RawInsightRow): { count: number; value: number } {
  const purchaseTypes = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  let count = 0;
  let value = 0;

  if (row.actions) {
    for (const a of row.actions) {
      if (purchaseTypes.includes(a.action_type)) {
        count += num(a.value);
      }
    }
  }
  if (row.action_values) {
    for (const a of row.action_values) {
      if (purchaseTypes.includes(a.action_type)) {
        value += num(a.value);
      }
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
  };
}

export function pctChange(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '0%';
  if (previous === 0) return '+∞%';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${round(change, 1)}%`;
}
