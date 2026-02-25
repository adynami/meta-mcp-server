import type { TenantContext } from '../tenant-context.js';
import { fetchBreakdownInsights } from '../meta-client.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';
import { resolveRange, type TimeRangeKey } from '../utils/date-ranges.js';

// ── Tool definition ──────────────────────────────────────────────────────────

export const performanceTools = [
  {
    name: 'meta_analyze_creative_performance',
    description: `Analyse ad-level performance for a campaign and produce a structured creative scorecard. Identifies the winning creative, losing creatives, and returns all data needed to synthesise a learning report and next creative brief.

This is the loop closure tool. After a campaign has run for 3–7+ days with meaningful spend, call this to turn raw metrics into the next creative direction.

Returns:
- Ranked creative scorecard (all ads sorted by primary metric)
- Per-ad computed metrics (CTR, CPC, CPA, ROAS, quality rankings)
- Analysis context (thresholds, rules) for synthesising winner/loser hypotheses
- next_brief schema to pass to meta_generate_creative_brief`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to analyse. All ads within the campaign will be fetched and compared.',
        },
        time_range: {
          type: 'string',
          enum: ['last_3d', 'last_7d', 'last_14d', 'last_30d'],
          description: 'Analysis window (default: last_7d). Use last_3d only for very high-spend accounts; last_14d or last_30d for steadier read.',
        },
        primary_metric: {
          type: 'string',
          enum: ['ctr', 'cpa', 'roas', 'cpc', 'conversions'],
          description: 'Metric to rank creatives by (default: auto-selected based on conversion data — cpa if conversions present, ctr otherwise).',
        },
        product_or_service: {
          type: 'string',
          description: 'What the campaign is advertising — helps generate a more specific next_brief.',
        },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'TRAFFIC'],
          description: 'Campaign objective — informs the next_brief recommendations.',
        },
      },
      required: ['campaign_id'],
    },
  },
];

// ── Analysis rules (returned to Claude for synthesis) ────────────────────────

const ANALYSIS_RULES = {
  winner_threshold: {
    min_impressions: 500,
    min_spend_ratio_vs_loser: 2,
    description: 'A meaningful winner needs at least 500 impressions AND at least 2× the spend of the loser',
  },
  inconclusive_rule: 'If all ads have similar metrics (within 20% of each other on the primary metric), call it inconclusive — needs more data',
  hypothesis_rule: 'The winner hypothesis must be about the creative (hook type, visual style, copy angle) — not just "it spent more"',
  next_test_rule: 'The next test should be a deliberate variation of the winner\'s strongest element',
  pause_rule: 'If a creative is a clear loser (high spend, no conversions, poor CTR vs winner), recommend pausing it',
};

const NEXT_BRIEF_SCHEMA = {
  product: 'string — what the campaign advertises',
  objective: 'string — campaign objective',
  audience: 'string — target audience',
  angle: 'string — creative angle based on winner insight',
  hook_style: 'string — hook approach to test',
  visual_direction: 'string — visual treatment',
  copy_direction: 'string — copy approach',
  key_benefits: ['array of benefit strings'],
  formats: ['array of format strings'],
  variants_to_test: 3,
  brand_voice: 'string or null',
};

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handlePerformanceTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_analyze_creative_performance': return analyzeCreativePerformance(ctx, args);
    default: throw new Error(`Unknown performance tool: ${name}`);
  }
}

async function analyzeCreativePerformance(ctx: TenantContext, args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = resolveRange(rangeKey);

  // Fetch ad-level insights for the campaign
  const result = await fetchBreakdownInsights(ctx, {
    campaign_id: args.campaign_id,
    time_range: range,
    level: 'ad',
    limit: 50,
  });

  if (!result.data?.length) {
    return {
      success: false,
      error: 'No ad-level data found for this campaign in the selected time range. Ensure the campaign has run for at least 1–2 days and has meaningful spend.',
      campaign_id: args.campaign_id,
      time_range: rangeKey,
    };
  }

  // Compute metrics for each ad
  const adMetrics = result.data.map((row: any) => {
    const m = computeMetrics(row as RawInsightRow);
    return {
      ad_id: row.ad_id,
      ad_name: row.ad_name ?? row.ad_id,
      adset_id: row.adset_id,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.ctr,
      cpc: m.cpc,
      cpm: m.cpm,
      conversions: m.conversions,
      cpa: m.cpa,
      roas: m.roas,
      quality_ranking: m.quality_ranking,
      engagement_rate_ranking: m.engagement_rate_ranking,
      conversion_rate_ranking: m.conversion_rate_ranking,
    };
  });

  // Auto-select primary metric
  const primaryMetric = args.primary_metric
    ?? (adMetrics.some((a: any) => a.conversions > 0) ? 'cpa' : 'ctr');

  // Sort by primary metric (cpa and cpc: ascending = better; others: descending)
  const ascendingMetrics = new Set(['cpa', 'cpc']);
  const sorted = [...adMetrics].sort((a: any, b: any) => {
    const av = a[primaryMetric] ?? 0;
    const bv = b[primaryMetric] ?? 0;
    return ascendingMetrics.has(primaryMetric) ? av - bv : bv - av;
  });

  // Scorecard — all ads ranked
  const scorecard = sorted.map((ad: any, idx: number) => ({ rank: idx + 1, ...ad }));

  return {
    campaign_id: args.campaign_id,
    period: `${range.since} to ${range.until}`,
    primary_metric: primaryMetric,
    ads_analysed: scorecard.length,
    scorecard,
    context: {
      product_or_service: args.product_or_service ?? null,
      objective: args.objective ?? null,
    },
    analysis_rules: ANALYSIS_RULES,
    next_brief_schema: NEXT_BRIEF_SCHEMA,
    instruction: 'Use the scorecard data and analysis_rules to identify the winner, diagnose losers, form a creative hypothesis, and generate a next_brief object matching next_brief_schema. Pass the next_brief to meta_generate_creative_brief to close the iteration loop.',
  };
}
