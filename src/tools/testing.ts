import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

async function graphGet(objectPath: string, params: Record<string, any> = {}): Promise<any> {
  const qp = new URLSearchParams({ access_token: config.accessToken });
  for (const [k, v] of Object.entries(params)) {
    qp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}?${qp.toString()}`;
  const response = await fetch(url);
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

async function graphPost(objectPath: string, params: Record<string, any>): Promise<any> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}`;
  const formBody = new URLSearchParams({ access_token: config.accessToken });
  for (const [k, v] of Object.entries(params)) {
    formBody.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

export const testingTools = [
  {
    name: 'meta_list_ab_tests',
    description: 'List A/B split tests (ad studies) on the ad account. Returns test name, status, type, and cell information. Use to review active experiments or check whether a test has reached statistical significance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'meta_create_ab_test',
    description: `Create an A/B split test comparing two campaigns on a single variable. Meta divides a shared audience 50/50 between the two campaigns and measures which performs better on the chosen metric.

Test variables:
- CREATIVE: same targeting/budget, different ad creatives
- PLACEMENT: same creative/budget, different placements
- TARGETING: same creative/budget, different audience targeting
- BUDGET_OPTIMIZATION: CBO vs ABO comparison

IMPORTANT — always confirm before calling:
1. Which two PAUSED campaigns to compare?
2. What are you testing (CREATIVE/PLACEMENT/TARGETING/BUDGET_OPTIMIZATION)?
3. What metric determines the winner (COST_PER_RESULT or ROAS)?
4. Test end date? (7–14 days minimum recommended)

This is a write operation — confirm all details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for this A/B test' },
        campaign_a_id: { type: 'string', description: 'First campaign ID (control). Should be PAUSED.' },
        campaign_b_id: { type: 'string', description: 'Second campaign ID (variant). Should be PAUSED.' },
        variable: {
          type: 'string',
          enum: ['CREATIVE', 'PLACEMENT', 'TARGETING', 'BUDGET_OPTIMIZATION'],
          description: 'The single variable being tested. The two campaigns should only differ on this dimension.',
        },
        optimization_metric: {
          type: 'string',
          enum: ['COST_PER_RESULT', 'ROAS'],
          description: 'Metric to determine the winner (default: COST_PER_RESULT)',
        },
        end_time: {
          type: 'string',
          description: 'Test end date/time in ISO 8601 format (e.g. 2025-07-15T23:59:59Z). Meta recommends 7+ days.',
        },
        confidence_level: {
          type: 'number',
          enum: [0.90, 0.95, 0.99],
          description: 'Statistical confidence threshold to declare a winner (default: 0.95)',
        },
      },
      required: ['name', 'campaign_a_id', 'campaign_b_id', 'variable'],
    },
  },
];

export async function handleTestingTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_ab_tests': return listAbTests(args);
    case 'meta_create_ab_test': return createAbTest(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function listAbTests(args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(`${config.adAccountId}/ad_studies`, {
      fields: 'id,name,type,status,start_time,end_time,description',
      limit: args.limit ?? 10,
    }),
  );

  return {
    tests: (result.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      type: s.type ?? null,
      status: s.status ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      description: s.description ?? null,
    })),
    total: (result.data ?? []).length,
  };
}

async function createAbTest(args: any): Promise<any> {
  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: A/B test "${args.name}" — campaign ${args.campaign_a_id} vs ${args.campaign_b_id} on ${args.variable}`,
    };
  }

  const confidenceLevel = args.confidence_level ?? 0.95;
  const optimizationMetric = args.optimization_metric ?? 'COST_PER_RESULT';

  const cells = [
    { name: 'Cell A (Control)', treatment_percentage: 50, campaigns: [args.campaign_a_id] },
    { name: 'Cell B (Variant)', treatment_percentage: 50, campaigns: [args.campaign_b_id] },
  ];

  const objectives = [{ name: optimizationMetric, type: 'HOLDOUT', is_primary: true }];

  const params: Record<string, any> = {
    name: args.name,
    description: `A/B test: ${args.variable} — ${args.campaign_a_id} vs ${args.campaign_b_id}`,
    cells: JSON.stringify(cells),
    objectives: JSON.stringify(objectives),
    confidence_level: String(confidenceLevel),
  };

  if (args.end_time) {
    params.end_time = String(Math.floor(new Date(args.end_time).getTime() / 1000));
  }

  const result = await rateLimitedCall(() =>
    graphPost(`${config.adAccountId}/ad_studies`, params),
  );

  return {
    success: true,
    test_id: result.id,
    name: args.name,
    variable: args.variable,
    optimization_metric: optimizationMetric,
    confidence_level: `${(confidenceLevel * 100).toFixed(0)}%`,
    campaign_a: args.campaign_a_id,
    campaign_b: args.campaign_b_id,
    ...(args.end_time && { end_time: args.end_time }),
    note: 'Activate both campaigns simultaneously to start the test. Meta will split the audience 50/50 automatically.',
  };
}
