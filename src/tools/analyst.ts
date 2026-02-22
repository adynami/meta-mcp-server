import { config } from '../config.js';
import {
  fetchAccountInsights, fetchInsightsBreakdown, fetchBreakdownInsights, getAccountContext,
  startAsyncInsights, pollInsightsReport, fetchInsightsReport,
} from '../meta-client.js';
import { resolveRange, resolvePreviousPeriod, type TimeRangeKey } from '../utils/date-ranges.js';
import { computeMetrics, pctChange, type RawInsightRow, type ComputedMetrics } from '../utils/metrics.js';

export const analystTools = [
  {
    name: 'meta_get_breakdown_insights',
    description: `Get performance metrics broken down by a dimension (age, gender, country, platform, placement, device) and/or a time series (daily, weekly). Use when the user asks "which country is performing best?", "what age group has the best ROAS?", "show me performance by placement", or "how did results trend day by day?". Dimensions and time series can be combined — e.g. breakdown=country with time_series=daily gives daily performance by country.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'],
          description: 'Analysis period (default: last_7d)',
        },
        breakdown: {
          type: 'string',
          enum: ['age', 'gender', 'age_gender', 'country', 'platform', 'placement', 'device'],
          description: [
            'age: break down by age group (13-17, 18-24, 25-34, 35-44, 45-54, 55-64, 65+)',
            'gender: break down by male/female/unknown',
            'age_gender: both age and gender simultaneously',
            'country: break down by country code',
            'platform: break down by publisher platform (facebook, instagram, audience_network, messenger)',
            'placement: break down by platform + position + device (most granular)',
            'device: break down by impression device type',
          ].join(' | '),
        },
        time_series: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Add time dimension to the breakdown. daily = one row per day, weekly = one row per 7-day period, monthly = one row per month. Can be combined with breakdown.',
        },
        campaign_id: { type: 'string', description: 'Restrict to a specific campaign' },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Aggregation level (default: account). Use "campaign" to see per-campaign breakdown rows.',
        },
        limit: { type: 'number', minimum: 1, maximum: 200, description: 'Max rows (default 50)' },
      },
    },
  },
  {
    name: 'meta_request_insights_report',
    description: `Run a deep insights report asynchronously. Use when you need large date ranges (90+ days), many rows, or cross-breakdown analysis that would time out with the synchronous meta_get_breakdown_insights. The report starts a background job, polls until complete, and returns all results.

Best for:
- Date ranges > 30 days
- High-granularity breakdowns (placement × device × country)
- Exporting large campaigns with 100+ ad sets or ads
- Time series over long periods (daily data for last 90 days)

If the user hasn't specified what breakdown or date range they want, ask them before running — this job can take 1–3 minutes.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        time_range: {
          type: 'string',
          enum: ['last_7d', 'last_14d', 'last_30d', 'last_60d', 'last_90d', 'this_month', 'last_month', 'this_quarter', 'last_year'],
          description: 'Analysis period. Supports longer ranges than the synchronous tool (default: last_30d)',
        },
        breakdown: {
          type: 'string',
          enum: ['age', 'gender', 'age_gender', 'country', 'platform', 'placement', 'device'],
          description: 'Dimension to break results down by. Ask the user if not specified.',
        },
        time_series: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Add a time dimension (daily/weekly/monthly rows). Ask the user if not specified.',
        },
        campaign_id: { type: 'string', description: 'Restrict to a specific campaign' },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Aggregation level (default: account)',
        },
      },
    },
  },
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
  if (name === 'meta_get_breakdown_insights') return getBreakdownInsights(args);
  if (name === 'meta_request_insights_report') return requestAsyncInsightsReport(args);
  throw new Error(`Unknown tool: ${name}`);
}

// Breakdown dimension → Meta API breakdowns param
const BREAKDOWN_MAP: Record<string, string[]> = {
  age:        ['age'],
  gender:     ['gender'],
  age_gender: ['age', 'gender'],
  country:    ['country'],
  platform:   ['publisher_platform'],
  placement:  ['publisher_platform', 'platform_position', 'impression_device'],
  device:     ['impression_device'],
};

// Dimension fields that appear in each row (for display)
const DIMENSION_FIELDS: Record<string, string[]> = {
  age:        ['age'],
  gender:     ['gender'],
  age_gender: ['age', 'gender'],
  country:    ['country'],
  platform:   ['publisher_platform'],
  placement:  ['publisher_platform', 'platform_position', 'impression_device'],
  device:     ['impression_device'],
};

const TIME_INCREMENT_MAP: Record<string, number | string> = {
  daily:   1,
  weekly:  7,
  monthly: 'monthly',
};

async function getBreakdownInsights(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = resolveRange(rangeKey);

  const breakdowns = args.breakdown ? BREAKDOWN_MAP[args.breakdown] : undefined;
  const time_increment = args.time_series ? TIME_INCREMENT_MAP[args.time_series] : undefined;

  const result = await fetchBreakdownInsights({
    campaign_id: args.campaign_id,
    time_range: range,
    breakdowns,
    time_increment,
    level: args.level ?? 'account',
    limit: args.limit ?? 50,
  });

  const dimFields = args.breakdown ? DIMENSION_FIELDS[args.breakdown] : [];

  const rows = result.data.map((row: any) => {
    const m = computeMetrics(row as RawInsightRow);

    // Build dimension labels
    const dim: Record<string, any> = {};
    for (const f of dimFields) {
      if (row[f] != null) dim[f] = row[f];
    }

    // Time label when using time_series
    if (time_increment != null && row.date_start) {
      dim.date = time_increment === 1 ? row.date_start : `${row.date_start} to ${row.date_stop}`;
    }

    // Entity label for non-account levels
    const entity = row.campaign_name ?? row.adset_name ?? row.ad_name ?? null;

    return {
      ...(entity && { entity }),
      ...(Object.keys(dim).length > 0 && { dimension: dim }),
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.ctr,
      cpc: m.cpc,
      cpm: m.cpm,
      conversions: m.conversions,
      cpa: m.cpa,
      roas: m.roas,
      ...(m.video && { video: m.video }),
      ...(m.quality_ranking && { quality_ranking: m.quality_ranking }),
      ...(m.engagement_rate_ranking && { engagement_rate_ranking: m.engagement_rate_ranking }),
      ...(m.conversion_rate_ranking && { conversion_rate_ranking: m.conversion_rate_ranking }),
    };
  });

  return {
    period: `${range.since} to ${range.until}`,
    breakdown: args.breakdown ?? null,
    time_series: args.time_series ?? null,
    level: args.level ?? 'account',
    rows,
    ...(result.paging?.cursors?.after && { next_cursor: result.paging.cursors.after }),
  };
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

function resolveAsyncRange(key: string): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  if (key === 'last_60d') return { since: fmt(daysAgo(60)), until: fmt(daysAgo(1)) };
  if (key === 'last_90d') return { since: fmt(daysAgo(90)), until: fmt(daysAgo(1)) };
  if (key === 'this_quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { since: fmt(qStart), until: fmt(now) };
  }
  if (key === 'last_year') {
    return { since: `${now.getFullYear() - 1}-01-01`, until: `${now.getFullYear() - 1}-12-31` };
  }
  // Fall back to resolveRange for supported standard keys
  return resolveRange(key as TimeRangeKey);
}

async function requestAsyncInsightsReport(args: any): Promise<any> {
  const rangeKey = args.time_range ?? 'last_30d';
  // Use resolveRange for standard keys, resolveAsyncRange for extended keys
  const extendedKeys = ['last_60d', 'last_90d', 'this_quarter', 'last_year'];
  const range = extendedKeys.includes(rangeKey)
    ? resolveAsyncRange(rangeKey)
    : resolveRange(rangeKey as TimeRangeKey);

  const breakdowns = args.breakdown ? BREAKDOWN_MAP[args.breakdown] : undefined;
  const time_increment = args.time_series ? TIME_INCREMENT_MAP[args.time_series] : undefined;

  // Start the async job
  const reportRunId = await startAsyncInsights({
    campaign_id: args.campaign_id,
    time_range: range,
    breakdowns,
    time_increment,
    level: args.level ?? 'account',
  });

  // Poll until complete
  await pollInsightsReport(reportRunId);

  // Collect all pages
  const allRows: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchInsightsReport(reportRunId, cursor);
    allRows.push(...page.data);
    cursor = page.paging?.cursors?.after && page.paging?.next ? page.paging.cursors.after : undefined;
  } while (cursor);

  const dimFields = args.breakdown ? DIMENSION_FIELDS[args.breakdown] : [];

  const rows = allRows.map((row: any) => {
    const m = computeMetrics(row as RawInsightRow);
    const dim: Record<string, any> = {};
    for (const f of dimFields) {
      if (row[f] != null) dim[f] = row[f];
    }
    if (time_increment != null && row.date_start) {
      dim.date = time_increment === 1 ? row.date_start : `${row.date_start} to ${row.date_stop}`;
    }
    const entity = row.campaign_name ?? row.adset_name ?? row.ad_name ?? null;
    return {
      ...(entity && { entity }),
      ...(Object.keys(dim).length > 0 && { dimension: dim }),
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.ctr,
      cpc: m.cpc,
      cpm: m.cpm,
      conversions: m.conversions,
      cpa: m.cpa,
      roas: m.roas,
      ...(m.video && { video: m.video }),
    };
  });

  return {
    period: `${range.since} to ${range.until}`,
    breakdown: args.breakdown ?? null,
    time_series: args.time_series ?? null,
    level: args.level ?? 'account',
    total_rows: rows.length,
    rows,
  };
}

function zeroMetrics(): ComputedMetrics {
  return { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, conversion_value: 0, roas: 0, cpa: 0, frequency: 0, reach: 0 };
}
