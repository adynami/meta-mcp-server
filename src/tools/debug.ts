import { readAd, readAdSet, readCampaign, fetchCampaignInsights } from '../meta-client.js';
import { resolveRange } from '../utils/date-ranges.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';

export const debugTools = [
  {
    name: 'debug_ad_setup',
    description: `Diagnose delivery issues for an ad. Checks for:
- Ad review status (rejected, in review, approved)
- Delivery status and effective status
- "Learning Limited" detection
- Budget/billing issues
- Targeting issues
- Creative issues

Returns human-readable diagnostic messages, not error codes.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'The Ad ID to diagnose' },
      },
      required: ['ad_id'],
    },
  },
];

export async function handleDebugTool(name: string, args: any): Promise<any> {
  if (name === 'debug_ad_setup') return debugAdSetup(args);
  throw new Error(`Unknown debug tool: ${name}`);
}

interface DiagnosticIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
}

async function debugAdSetup(args: any): Promise<any> {
  const adId = args.ad_id;
  const issues: DiagnosticIssue[] = [];

  // Fetch ad details
  const ad = await readAd(adId, [
    'id', 'name', 'status', 'effective_status',
    'configured_status', 'ad_review_feedback',
    'issues_info', 'adset_id', 'campaign_id',
    'created_time',
  ]);

  const adEffective = ad.effective_status;
  const adConfigured = ad.configured_status;

  // Check ad status
  if (adEffective === 'DISAPPROVED') {
    const feedback = ad.ad_review_feedback;
    if (feedback?.global) {
      for (const [key, val] of Object.entries(feedback.global)) {
        issues.push({
          severity: 'error',
          category: 'Ad Review',
          message: `REJECTED: ${humanizeReviewFeedback(key, val as string)}`,
        });
      }
    } else {
      issues.push({ severity: 'error', category: 'Ad Review', message: 'Ad was rejected by Meta review. Check ad content, landing page, and targeting for policy violations.' });
    }
  } else if (adEffective === 'PENDING_REVIEW') {
    issues.push({ severity: 'info', category: 'Ad Review', message: 'Ad is pending review. This typically takes up to 24 hours.' });
  } else if (adEffective === 'WITH_ISSUES') {
    issues.push({ severity: 'warning', category: 'Delivery', message: 'Ad has delivery issues. See additional diagnostics below.' });
  }

  // Check issues_info from the API
  if (ad.issues_info?.length) {
    for (const issue of ad.issues_info) {
      issues.push({
        severity: issue.level === 'ERROR' ? 'error' : 'warning',
        category: 'Platform Issue',
        message: issue.error_summary ?? issue.error_message ?? JSON.stringify(issue),
      });
    }
  }

  // Check ad set
  let adsetInfo: any = null;
  try {
    adsetInfo = await readAdSet(ad.adset_id, [
      'id', 'name', 'status', 'effective_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining',
      'optimization_goal', 'bid_strategy', 'learning_stage_info',
    ]);

    // Learning Limited check
    if (adsetInfo.learning_stage_info) {
      const stage = adsetInfo.learning_stage_info;
      if (stage === 'LEARNING_LIMITED' || stage.status === 'LEARNING_LIMITED') {
        issues.push({
          severity: 'warning',
          category: 'Learning Phase',
          message: 'Ad set is LEARNING LIMITED. It cannot get enough conversions to exit the learning phase. Consider: broadening targeting, increasing budget, or simplifying the conversion event.',
        });
      } else if (stage === 'LEARNING' || stage.status === 'LEARNING') {
        issues.push({
          severity: 'info',
          category: 'Learning Phase',
          message: 'Ad set is in the learning phase. Performance may be unstable. Avoid making edits until ~50 conversions.',
        });
      }
    }

    // Budget check
    if (adsetInfo.budget_remaining === '0' || adsetInfo.budget_remaining === 0) {
      issues.push({ severity: 'error', category: 'Budget', message: 'Ad set has no remaining budget. Increase budget to resume delivery.' });
    }

    if (adsetInfo.effective_status === 'PAUSED') {
      issues.push({ severity: 'warning', category: 'Status', message: 'Ad set is PAUSED. The ad cannot deliver while its ad set is paused.' });
    }
  } catch (e: any) {
    issues.push({ severity: 'warning', category: 'Ad Set', message: `Could not fetch ad set details: ${e.message}` });
  }

  // Check campaign
  let campaignInfo: any = null;
  try {
    campaignInfo = await readCampaign(ad.campaign_id, [
      'id', 'name', 'status', 'effective_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining',
    ]);

    if (campaignInfo.effective_status === 'PAUSED') {
      issues.push({ severity: 'warning', category: 'Status', message: 'Campaign is PAUSED. No ads will deliver until the campaign is activated.' });
    }

    if (campaignInfo.budget_remaining === '0' || campaignInfo.budget_remaining === 0) {
      issues.push({ severity: 'error', category: 'Budget', message: 'Campaign budget exhausted.' });
    }
  } catch (e: any) {
    issues.push({ severity: 'warning', category: 'Campaign', message: `Could not fetch campaign details: ${e.message}` });
  }

  // Check recent performance
  let perfNote: string | null = null;
  try {
    const range = resolveRange('last_3d');
    const insights = await fetchCampaignInsights(ad.campaign_id, { time_range: range });
    if (insights.length) {
      const m = computeMetrics(insights[0] as RawInsightRow);
      if (m.impressions === 0) {
        perfNote = 'Zero impressions in last 3 days. Likely a delivery block (review, budget, or targeting).';
      } else if (m.clicks === 0 && m.impressions > 1000) {
        perfNote = `${m.impressions} impressions but zero clicks. Creative may need improvement.`;
      } else if (m.ctr < 0.5) {
        perfNote = `Very low CTR (${m.ctr}%). Consider testing new creative or refining audience.`;
      }
    }
  } catch {
    // skip perf check
  }

  // Build diagnosis
  const healthScore = issues.filter(i => i.severity === 'error').length === 0
    ? (issues.filter(i => i.severity === 'warning').length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION')
    : 'CRITICAL';

  return {
    ad_id: adId,
    ad_name: ad.name,
    effective_status: adEffective,
    configured_status: adConfigured,
    health: healthScore,
    issues: issues.length ? issues : [{ severity: 'info', category: 'Status', message: 'No issues detected. Ad appears healthy.' }],
    ...(perfNote && { performance_note: perfNote }),
    hierarchy: {
      campaign: campaignInfo ? { id: campaignInfo.id, name: campaignInfo.name, status: campaignInfo.effective_status } : null,
      adset: adsetInfo ? { id: adsetInfo.id, name: adsetInfo.name, status: adsetInfo.effective_status } : null,
    },
  };
}

function humanizeReviewFeedback(key: string, val: string): string {
  const map: Record<string, string> = {
    'POLICY_VIOLATION': 'Ad violates Meta advertising policies',
    'PERSONAL_ATTRIBUTES': 'Ad implies personal attributes about the viewer',
    'MISLEADING_CLAIMS': 'Ad contains misleading or exaggerated claims',
    'ADULT_CONTENT': 'Ad contains adult or suggestive content',
    'DISCRIMINATION': 'Ad may be discriminatory',
    'LANDING_PAGE': 'Landing page does not meet Meta requirements',
    'LOW_QUALITY': 'Ad creative is low quality or clickbait',
  };

  return map[key] ?? `${key}: ${val}`;
}
