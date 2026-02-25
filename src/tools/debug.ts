import type { TenantContext } from '../tenant-context.js';
import { readAd, readAdSet, readCampaign, fetchCampaignInsights } from '../meta-client.js';
import { resolveRange } from '../utils/date-ranges.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';

export const debugTools = [
  {
    name: 'meta_debug_ad',
    description: `Diagnose why an ad is not delivering or underperforming. Use when the user asks "why isn't my ad spending?" or "what's wrong with this ad?". Checks the full hierarchy (ad -> ad set -> campaign) for:
- Ad review status (rejected/pending/approved) with human-readable rejection reasons
- Learning phase status (Learning Limited detection)
- Budget exhaustion at ad set and campaign level
- Paused parent entities blocking delivery
- Recent performance red flags (zero impressions, low CTR)

Returns a health score (HEALTHY/NEEDS_ATTENTION/CRITICAL) and actionable fix suggestions.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'The Meta Ad ID to diagnose (numeric string)' },
      },
      required: ['ad_id'],
    },
  },
];

export async function handleDebugTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  if (name === 'meta_debug_ad') return debugAdSetup(ctx, args);
  throw new Error(`Unknown tool: ${name}`);
}

interface Issue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
}

async function debugAdSetup(ctx: TenantContext, args: any): Promise<any> {
  const adId = args.ad_id;
  const issues: Issue[] = [];

  const ad = await readAd(ctx, adId, [
    'id', 'name', 'status', 'effective_status',
    'configured_status', 'ad_review_feedback',
    'issues_info', 'adset_id', 'campaign_id',
  ]);

  const adEffective = ad.effective_status;

  // Ad review
  if (adEffective === 'DISAPPROVED') {
    const feedback = ad.ad_review_feedback;
    if (feedback?.global) {
      for (const [key, val] of Object.entries(feedback.global)) {
        issues.push({ severity: 'error', category: 'Ad Review', message: `REJECTED: ${humanizeReviewFeedback(key, val as string)}` });
      }
    } else {
      issues.push({ severity: 'error', category: 'Ad Review', message: 'Ad rejected. Check content, landing page, and targeting for policy violations.' });
    }
  } else if (adEffective === 'PENDING_REVIEW') {
    issues.push({ severity: 'info', category: 'Ad Review', message: 'Pending review (typically <24 hours).' });
  } else if (adEffective === 'WITH_ISSUES') {
    issues.push({ severity: 'warning', category: 'Delivery', message: 'Ad has delivery issues.' });
  }

  // Platform issues
  if (ad.issues_info?.length) {
    for (const issue of ad.issues_info) {
      issues.push({
        severity: issue.level === 'ERROR' ? 'error' : 'warning',
        category: 'Platform',
        message: issue.error_summary ?? issue.error_message ?? JSON.stringify(issue),
      });
    }
  }

  // Ad set checks
  let adsetName = '';
  try {
    const adset = await readAdSet(ctx, ad.adset_id, [
      'id', 'name', 'status', 'effective_status',
      'daily_budget', 'budget_remaining', 'learning_stage_info',
    ]);
    adsetName = adset.name;

    const stage = adset.learning_stage_info;
    if (stage === 'LEARNING_LIMITED' || stage?.status === 'LEARNING_LIMITED') {
      issues.push({ severity: 'warning', category: 'Learning', message: 'LEARNING LIMITED — not enough conversions. Broaden targeting, raise budget, or simplify conversion event.' });
    } else if (stage === 'LEARNING' || stage?.status === 'LEARNING') {
      issues.push({ severity: 'info', category: 'Learning', message: 'In learning phase. Avoid edits until ~50 conversions.' });
    }

    if (adset.budget_remaining === '0' || adset.budget_remaining === 0) {
      issues.push({ severity: 'error', category: 'Budget', message: 'Ad set budget exhausted.' });
    }
    if (adset.effective_status === 'PAUSED') {
      issues.push({ severity: 'warning', category: 'Status', message: 'Ad set is PAUSED — ad cannot deliver.' });
    }
  } catch (e: any) {
    issues.push({ severity: 'warning', category: 'Ad Set', message: `Could not fetch ad set: ${e.message}` });
  }

  // Campaign checks
  let campaignName = '';
  try {
    const campaign = await readCampaign(ctx, ad.campaign_id, ['id', 'name', 'status', 'effective_status', 'budget_remaining']);
    campaignName = campaign.name;

    if (campaign.effective_status === 'PAUSED') {
      issues.push({ severity: 'warning', category: 'Status', message: 'Campaign is PAUSED — no ads deliver.' });
    }
    if (campaign.budget_remaining === '0' || campaign.budget_remaining === 0) {
      issues.push({ severity: 'error', category: 'Budget', message: 'Campaign budget exhausted.' });
    }
  } catch (e: any) {
    issues.push({ severity: 'warning', category: 'Campaign', message: `Could not fetch campaign: ${e.message}` });
  }

  // Recent performance
  let perfNote: string | null = null;
  try {
    const range = resolveRange('last_3d');
    const insights = await fetchCampaignInsights(ctx, ad.campaign_id, { time_range: range });
    if (insights.length) {
      const m = computeMetrics(insights[0] as RawInsightRow);
      if (m.impressions === 0) perfNote = 'Zero impressions in 3 days — likely blocked by review, budget, or targeting.';
      else if (m.clicks === 0 && m.impressions > 1000) perfNote = `${m.impressions} impressions, zero clicks — creative may need work.`;
      else if (m.ctr < 0.5) perfNote = `CTR is ${m.ctr}% — consider new creative or refined audience.`;
    }
  } catch { /* skip */ }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const health = errors > 0 ? 'CRITICAL' : warnings > 0 ? 'NEEDS_ATTENTION' : 'HEALTHY';

  return {
    ad: ad.name,
    status: adEffective,
    health,
    issues: issues.length ? issues : [{ severity: 'info', category: 'Status', message: 'No issues detected.' }],
    ...(perfNote && { performance_note: perfNote }),
    hierarchy: { campaign: campaignName, adset: adsetName },
  };
}

function humanizeReviewFeedback(key: string, val: string): string {
  const map: Record<string, string> = {
    POLICY_VIOLATION: 'Violates Meta advertising policies',
    PERSONAL_ATTRIBUTES: 'Implies personal attributes about viewer',
    MISLEADING_CLAIMS: 'Contains misleading or exaggerated claims',
    ADULT_CONTENT: 'Contains adult or suggestive content',
    DISCRIMINATION: 'May be discriminatory',
    LANDING_PAGE: 'Landing page does not meet requirements',
    LOW_QUALITY: 'Creative is low quality or clickbait',
  };
  return map[key] ?? `${key}: ${val}`;
}
