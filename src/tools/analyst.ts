import { config } from '../config.js';
import { fetchAccountInsights, fetchInsightsBreakdown, getAccountContext } from '../meta-client.js';
import { resolveRange, resolvePreviousPeriod, type TimeRangeKey } from '../utils/date-ranges.js';
import { computeMetrics, pctChange, type RawInsightRow, type ComputedMetrics } from '../utils/metrics.js';

export const analystTools = [
  {
    name: 'get_account_intelligence',
    description: `High-density intelligence report for the ad account. Returns:
- Period-over-period trend analysis (spend, CPA, ROAS, CTR changes)
- Top 3 campaigns by ROAS
- Top 3 "bleeder" campaigns (high spend, zero conversions)
- Account health summary

Use this when the user asks "how are my ads doing?" or wants an overview.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'],
          description: 'Analysis period (default: last_7d)',
        },
      },
    },
  },
];

export async function handleAnalystTool(name: string, args: any): Promise<any> {
  if (name === 'get_account_intelligence') return getAccountIntelligence(args);
  throw new Error(`Unknown analyst tool: ${name}`);
}

async function getAccountIntelligence(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const currentRange = resolveRange(rangeKey);
  const previousRange = resolvePreviousPeriod(rangeKey);
  const account = await getAccountContext();

  // Fetch current & previous period + campaign breakdown in parallel
  const [currentRaw, previousRaw, campaignBreakdown] = await Promise.all([
    fetchAccountInsights({ time_range: currentRange }),
    fetchAccountInsights({ time_range: previousRange }),
    fetchInsightsBreakdown({
      time_range: currentRange,
      level: 'campaign',
      limit: 50,
      sort: ['spend_descending'],
    }),
  ]);

  const current = currentRaw.length ? computeMetrics(currentRaw[0] as RawInsightRow) : zeroMetrics();
  const previous = previousRaw.length ? computeMetrics(previousRaw[0] as RawInsightRow) : zeroMetrics();

  // Campaign-level analysis
  const campaigns = campaignBreakdown.map((row: any) => ({
    id: row.campaign_id,
    name: row.campaign_name,
    metrics: computeMetrics(row as RawInsightRow),
  }));

  // Top performers by ROAS (must have >0 spend and >0 conversions)
  const topByRoas = campaigns
    .filter((c: any) => c.metrics.roas > 0)
    .sort((a: any, b: any) => b.metrics.roas - a.metrics.roas)
    .slice(0, 3);

  // Bleeders: high spend, zero conversions
  const bleeders = campaigns
    .filter((c: any) => c.metrics.spend > 0 && c.metrics.conversions === 0)
    .sort((a: any, b: any) => b.metrics.spend - a.metrics.spend)
    .slice(0, 3);

  // Build the intelligence report
  const report = {
    account: { name: account.name, currency: account.currency, timezone: account.timezone },
    period: { current: `${currentRange.since} to ${currentRange.until}`, previous: `${previousRange.since} to ${previousRange.until}` },

    trends: {
      spend: { current: current.spend, previous: previous.spend, change: pctChange(current.spend, previous.spend) },
      impressions: { current: current.impressions, previous: previous.impressions, change: pctChange(current.impressions, previous.impressions) },
      clicks: { current: current.clicks, previous: previous.clicks, change: pctChange(current.clicks, previous.clicks) },
      ctr: { current: current.ctr, previous: previous.ctr, change: pctChange(current.ctr, previous.ctr) },
      cpc: { current: current.cpc, previous: previous.cpc, change: pctChange(current.cpc, previous.cpc) },
      conversions: { current: current.conversions, previous: previous.conversions, change: pctChange(current.conversions, previous.conversions) },
      cpa: { current: current.cpa, previous: previous.cpa, change: pctChange(current.cpa, previous.cpa) },
      roas: { current: current.roas, previous: previous.roas, change: pctChange(current.roas, previous.roas) },
    },

    top_performers: topByRoas.map((c: any) => ({
      campaign: c.name,
      roas: c.metrics.roas,
      spend: c.metrics.spend,
      conversions: c.metrics.conversions,
      revenue: c.metrics.conversion_value,
    })),

    bleeders: bleeders.map((c: any) => ({
      campaign: c.name,
      spend: c.metrics.spend,
      impressions: c.metrics.impressions,
      clicks: c.metrics.clicks,
      note: 'Spending with ZERO conversions',
    })),

    summary: buildSummaryText(current, previous, topByRoas, bleeders, account.currency),
  };

  return report;
}

function buildSummaryText(
  current: ComputedMetrics,
  previous: ComputedMetrics,
  topPerformers: any[],
  bleeders: any[],
  currency: string,
): string {
  const lines: string[] = [];

  lines.push(`## Period Overview`);
  lines.push(`Spend: ${currency} ${current.spend} (${pctChange(current.spend, previous.spend)} vs prev period)`);
  lines.push(`Conversions: ${current.conversions} (${pctChange(current.conversions, previous.conversions)})`);
  lines.push(`ROAS: ${current.roas}x (${pctChange(current.roas, previous.roas)})`);
  lines.push(`CPA: ${currency} ${current.cpa} (${pctChange(current.cpa, previous.cpa)})`);
  lines.push(`CTR: ${current.ctr}% (${pctChange(current.ctr, previous.ctr)})`);
  lines.push('');

  if (topPerformers.length) {
    lines.push(`## Top ${topPerformers.length} Campaigns by ROAS`);
    for (const c of topPerformers) {
      lines.push(`- "${c.name}": ${c.metrics.roas}x ROAS, ${currency} ${c.metrics.conversion_value} revenue on ${currency} ${c.metrics.spend} spend`);
    }
    lines.push('');
  }

  if (bleeders.length) {
    lines.push(`## ${bleeders.length} Bleeder Campaign(s) (Spend with 0 Conversions)`);
    for (const c of bleeders) {
      lines.push(`- "${c.name}": ${currency} ${c.metrics.spend} wasted (${c.metrics.clicks} clicks, ${c.metrics.impressions} impressions)`);
    }
    lines.push('');
  } else {
    lines.push('No bleeder campaigns detected.');
  }

  return lines.join('\n');
}

function zeroMetrics(): ComputedMetrics {
  return { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, conversion_value: 0, roas: 0, cpa: 0, frequency: 0, reach: 0 };
}
