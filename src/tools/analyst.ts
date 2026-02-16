import { config } from '../config.js';
import { fetchAccountInsights, fetchInsightsBreakdown, getAccountContext } from '../meta-client.js';
import { resolveRange, resolvePreviousPeriod, type TimeRangeKey } from '../utils/date-ranges.js';
import { computeMetrics, pctChange, type RawInsightRow, type ComputedMetrics } from '../utils/metrics.js';

export const analystTools = [
  {
    name: 'meta_account_intelligence',
    description: `Generate a high-density intelligence report for the ad account. Use this when the user asks "how are my ads doing?", wants a performance overview, or needs to identify problems.

Returns a pre-built text summary (not raw data) containing:
- Period-over-period trends (spend, CPA, ROAS, CTR changes vs previous period)
- Top 3 campaigns by ROAS (best performers)
- Top 3 "bleeder" campaigns (spending with zero conversions)

Use response_format="concise" if you only need the summary text. Use "detailed" if you also need the raw trend numbers for follow-up calculations.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'],
          description: 'Analysis period (default: last_7d)',
        },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'concise = summary text only (~200 tokens), detailed = summary + structured trend data (default: concise)',
        },
      },
    },
  },
];

export async function handleAnalystTool(name: string, args: any): Promise<any> {
  if (name === 'meta_account_intelligence') return getAccountIntelligence(args);
  throw new Error(`Unknown tool: ${name}`);
}

async function getAccountIntelligence(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const currentRange = resolveRange(rangeKey);
  const previousRange = resolvePreviousPeriod(rangeKey);
  const account = await getAccountContext();

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

  const campaigns = campaignBreakdown.map((row: any) => ({
    name: row.campaign_name,
    metrics: computeMetrics(row as RawInsightRow),
  }));

  const topByRoas = campaigns
    .filter((c: any) => c.metrics.roas > 0)
    .sort((a: any, b: any) => b.metrics.roas - a.metrics.roas)
    .slice(0, 3);

  const bleeders = campaigns
    .filter((c: any) => c.metrics.spend > 0 && c.metrics.conversions === 0)
    .sort((a: any, b: any) => b.metrics.spend - a.metrics.spend)
    .slice(0, 3);

  const ccy = account.currency;
  const summary = buildSummaryText(current, previous, topByRoas, bleeders, ccy, currentRange, previousRange);

  // Concise mode: just the summary text — minimal tokens
  if (args.response_format !== 'detailed') {
    return { summary };
  }

  // Detailed mode: summary + structured data for follow-up
  return {
    summary,
    account: { name: account.name, currency: ccy, timezone: account.timezone },
    period: { current: `${currentRange.since} to ${currentRange.until}`, previous: `${previousRange.since} to ${previousRange.until}` },
    trends: {
      spend: { current: current.spend, previous: previous.spend, change: pctChange(current.spend, previous.spend) },
      ctr: { current: current.ctr, previous: previous.ctr, change: pctChange(current.ctr, previous.ctr) },
      cpc: { current: current.cpc, previous: previous.cpc, change: pctChange(current.cpc, previous.cpc) },
      conversions: { current: current.conversions, previous: previous.conversions, change: pctChange(current.conversions, previous.conversions) },
      cpa: { current: current.cpa, previous: previous.cpa, change: pctChange(current.cpa, previous.cpa) },
      roas: { current: current.roas, previous: previous.roas, change: pctChange(current.roas, previous.roas) },
    },
    top_performers: topByRoas.map((c: any) => ({
      campaign: c.name, roas: c.metrics.roas, spend: c.metrics.spend, revenue: c.metrics.conversion_value,
    })),
    bleeders: bleeders.map((c: any) => ({
      campaign: c.name, spend: c.metrics.spend, clicks: c.metrics.clicks,
    })),
  };
}

function buildSummaryText(
  current: ComputedMetrics,
  previous: ComputedMetrics,
  topPerformers: any[],
  bleeders: any[],
  ccy: string,
  currentRange: { since: string; until: string },
  previousRange: { since: string; until: string },
): string {
  const lines: string[] = [];

  lines.push(`Period: ${currentRange.since} to ${currentRange.until} vs ${previousRange.since} to ${previousRange.until}`);
  lines.push(`Spend: ${ccy} ${current.spend} (${pctChange(current.spend, previous.spend)})`);
  lines.push(`Conversions: ${current.conversions} (${pctChange(current.conversions, previous.conversions)}) | CPA: ${ccy} ${current.cpa} (${pctChange(current.cpa, previous.cpa)})`);
  lines.push(`ROAS: ${current.roas}x (${pctChange(current.roas, previous.roas)}) | CTR: ${current.ctr}% (${pctChange(current.ctr, previous.ctr)})`);

  if (topPerformers.length) {
    lines.push(`Top by ROAS: ${topPerformers.map((c: any) => `"${c.name}" ${c.metrics.roas}x`).join(', ')}`);
  }

  if (bleeders.length) {
    lines.push(`Bleeders (spend, 0 conversions): ${bleeders.map((c: any) => `"${c.name}" ${ccy} ${c.metrics.spend}`).join(', ')}`);
  }

  return lines.join('\n');
}

function zeroMetrics(): ComputedMetrics {
  return { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, conversion_value: 0, roas: 0, cpa: 0, frequency: 0, reach: 0 };
}
