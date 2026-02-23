import { config } from '../config.js';
import { fetchBreakdownInsights } from '../meta-client.js';
import { computeMetrics, type RawInsightRow } from '../utils/metrics.js';
import { resolveRange, type TimeRangeKey } from '../utils/date-ranges.js';

// ── Tool definition ──────────────────────────────────────────────────────────

export const performanceTools = [
  {
    name: 'meta_analyze_creative_performance',
    description: `Analyse ad-level performance for a campaign and produce a structured creative learning report. Identifies the winning creative, the losing creative(s), the hypothesis that explains the gap, and a ready-to-use next_brief object to feed straight back into meta_generate_creative_brief to close the iteration loop.

This is the loop closure tool. After a campaign has run for 3–7+ days with meaningful spend, call this to turn raw metrics into the next creative direction.

Returns:
- Ranked creative scorecard (all ads sorted by primary metric)
- Winner analysis with specific copy/format hypotheses
- Loser diagnosis with recommended action (pause, fix, or test variant)
- next_brief: a pre-filled brief object ready to pass to meta_generate_creative_brief

Requires GEMINI_API_KEY for the synthesis step.`,
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
          description: 'What the campaign is advertising — helps Gemini write a more specific next_brief.',
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

// ── Gemini synthesis prompt ──────────────────────────────────────────────────

const PERFORMANCE_SYSTEM_PROMPT = `You are a senior Meta advertising analyst. You are given ad-level performance data for a campaign. Your job is to:

1. Identify the winning creative and explain WHY it won (hypothesis, not just "it had better CTR")
2. Identify losing creatives and diagnose what went wrong
3. Synthesise a clear "what to test next" recommendation
4. Output a next_brief object in the canonical creative brief format

ANALYSIS RULES:
- A meaningful winner needs at least 500 impressions AND at least 2× the spend of the loser
- If all ads have similar metrics, call it "inconclusive — needs more data"
- The winner hypothesis must be about the creative (hook type, visual style, copy angle) — not just "it spent more"
- The next test should be a deliberate variation of the winner's strongest element
- If a creative is a clear loser (high spend, no conversions, poor CTR vs winner), recommend pausing it

Output ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "winner": {
    "ad_id": "string",
    "ad_name": "string",
    "key_metrics": { "spend": 0, "ctr": 0, "cpa": 0, "roas": 0, "conversions": 0 },
    "hypothesis": "string — why this won, citing specific creative characteristics"
  },
  "losers": [
    {
      "ad_id": "string",
      "ad_name": "string",
      "diagnosis": "string — what went wrong",
      "action": "pause | fix | test_variant"
    }
  ],
  "learning": "string — the core insight from this test in one sentence",
  "confidence": "high | medium | low | inconclusive",
  "confidence_reason": "string — why this confidence level",
  "next_brief": {
    "product": "string",
    "objective": "string",
    "audience": "string",
    "angle": "string",
    "hook_style": "string",
    "visual_direction": "string",
    "copy_direction": "string",
    "key_benefits": ["array"],
    "formats": ["array"],
    "variants_to_test": 3,
    "brand_voice": "string or null"
  },
  "next_step": "string — exact instruction: what to pause, what to scale, and what to pass to meta_generate_creative_brief"
}`;

// ── Gemini call ──────────────────────────────────────────────────────────────

async function callGeminiForAnalysis(prompt: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PERFORMANCE_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,   // lower temp for analytical tasks
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Gemini API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.error?.message ?? message;
    } catch { /* use default */ }
    throw new Error(message);
  }

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return JSON.parse(text);
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handlePerformanceTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_analyze_creative_performance': return analyzeCreativePerformance(args);
    default: throw new Error(`Unknown performance tool: ${name}`);
  }
}

async function analyzeCreativePerformance(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = resolveRange(rangeKey);

  // Fetch ad-level insights for the campaign
  const result = await fetchBreakdownInsights({
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

  // If GEMINI_API_KEY not set, return the scorecard without synthesis
  if (!config.geminiApiKey) {
    return {
      campaign_id: args.campaign_id,
      period: `${range.since} to ${range.until}`,
      primary_metric: primaryMetric,
      ads_analysed: scorecard.length,
      scorecard,
      synthesis: null,
      note: 'Set GEMINI_API_KEY in meta-mcp-server env to enable AI synthesis (winner hypothesis, loser diagnosis, next_brief generation).',
    };
  }

  // Build Gemini prompt from the sorted scorecard
  const prompt = `Campaign ID: ${args.campaign_id}
Period: ${range.since} to ${range.until}
Primary ranking metric: ${primaryMetric}
${args.product_or_service ? `Product/service: ${args.product_or_service}` : ''}
${args.objective ? `Campaign objective: ${args.objective}` : ''}

Ad performance data (ranked by ${primaryMetric}, best first):
${JSON.stringify(scorecard, null, 2)}

Analyse this data and produce the creative learning report.`;

  const synthesis = await callGeminiForAnalysis(prompt);

  return {
    campaign_id: args.campaign_id,
    period: `${range.since} to ${range.until}`,
    primary_metric: primaryMetric,
    ads_analysed: scorecard.length,
    scorecard,
    synthesis,
    loop_instruction: 'To activate the next iteration: pass synthesis.next_brief to meta_generate_creative_brief with signal_type: "from_prompt", then run the full creative pipeline.',
  };
}
