import { z } from 'zod';

// ── Input Schemas ──

export const timeRangeSchema = z.enum([
  'today', 'yesterday', 'last_3d', 'last_7d', 'last_14d',
  'last_30d', 'last_90d', 'this_month', 'last_month',
]);

export const paginationSchema = z.object({
  limit: z.number().min(1).max(50).default(5),
  after: z.string().optional(),
});

export const campaignStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']);

export const objectiveSchema = z.enum([
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_APP_PROMOTION',
]);

export const targetingSchema = z.object({
  age_min: z.number().min(18).max(65).default(18),
  age_max: z.number().min(18).max(65).default(65),
  genders: z.array(z.number().min(0).max(2)).default([0]),
  geo_locations: z.object({
    countries: z.array(z.string().length(2)).default(['US']),
    location_types: z.array(z.string()).default(['home', 'recent']),
  }),
  publisher_platforms: z.array(z.string()).optional(),
  facebook_positions: z.array(z.string()).optional(),
  instagram_positions: z.array(z.string()).optional(),
});

// ── Output Types ──

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  buying_type: string;
}

export interface AdSetSummary {
  id: string;
  name: string;
  status: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  bid_strategy: string | null;
  optimization_goal: string | null;
  targeting_summary: string;
}

export interface AdSummary {
  id: string;
  name: string;
  status: string;
  creative_id: string | null;
  preview_url: string | null;
}

export interface InsightsSummary {
  entity_id: string;
  entity_name: string;
  date_range: string;
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

export interface AccountContext {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: number;
  disable_reason: number;
}
