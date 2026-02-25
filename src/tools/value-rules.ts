import type { TenantContext } from '../tenant-context.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet, graphPost, graphDelete } from '../utils/graph.js';

// ── Tool definitions ─────────────────────────────────────────────────────────

export const valueRulesTools = [
  {
    name: 'meta_list_value_rules',
    description: `List Value Rules configured for the ad account. Value Rules are an ADVANCED optional feature — only use when the user explicitly asks for them.

Value Rules tell Meta's bidding algorithm how much a conversion from a particular audience segment, placement, device, or location is worth to your business. They modify bids in real time during the auction — a conversion from iOS users might be worth 2× a conversion from Android, for example. They are NOT the same as Automated Rules (which pause or scale campaigns after the fact).

Use this tool to review existing rules before creating new ones, or to find a rule ID for update/delete.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default: 25)' },
      },
    },
  },
  {
    name: 'meta_create_value_rule',
    description: `Create a Value Rule that adjusts Meta's bidding for a specific audience segment, device, placement, or location. This is an ADVANCED optional feature — only call when the user explicitly asks to create a value rule.

Value Rules are bid multipliers applied in real time during the auction. They tell Meta "conversions from this segment are worth X× more (or less) to my business." Meta then bids more or less aggressively for those impressions.

IMPORTANT — Meta's official guidance states that overall CPA may increase when using Value Rules. They are best suited for businesses that have genuine differences in customer lifetime value across segments (e.g. a customer from New York is historically worth 3× a customer from a rural market).

Rules are evaluated in priority order. When multiple rules match the same user, only the first matching rule is applied. Order rules from most specific to least specific.

Always confirm all of the following with the user before calling:
1. What condition to match? (OS, country, placement, age, gender, or a combination)
2. What multiplier? (e.g. 1.5 = bid 50% more, 0.7 = bid 30% less)
3. What priority vs existing rules?
4. Which campaign should this apply to (if campaign-specific)?

This is a write operation — confirm details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Display name for the rule (e.g. "Boost iOS users", "Reduce Audience Network bids")',
        },
        conditions: {
          type: 'array',
          description: 'Conditions that determine when this rule applies. Maximum 2 conditions per rule — they are AND-ed together.',
          minItems: 1,
          maxItems: 2,
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                enum: [
                  'user_os',
                  'country',
                  'region',
                  'city',
                  'age',
                  'gender',
                  'publisher_platform',
                  'placement',
                ],
                description: `The dimension to match on:
- user_os: device OS — values: IOS, ANDROID, DESKTOP
- country: 2-letter ISO codes — e.g. US, GB, AU
- region: Meta region keys (from meta_search_geo_locations with location_types: [region])
- city: Meta city keys (from meta_search_geo_locations with location_types: [city])
- age: Meta age brackets — 13-17, 18-24, 25-34, 35-44, 45-54, 55-64, 65+
- gender: 1 (male) or 2 (female)
- publisher_platform: facebook, instagram, audience_network, messenger, threads
- placement: feed, story, reels, marketplace, video_feeds, right_hand_column, instream_video, explore`,
              },
              operator: {
                type: 'string',
                enum: ['i_contains', 'i_not_contains'],
                description: 'i_contains = field IS one of the values. i_not_contains = field is NOT one of the values.',
              },
              values: {
                type: 'array',
                items: { type: 'string' },
                description: 'One or more values to match. For country: ["US","CA"]. For user_os: ["IOS"]. For gender: ["1"] (male) or ["2"] (female). For age: ["25-34","35-44"].',
              },
            },
            required: ['field', 'operator', 'values'],
          },
        },
        multiplier: {
          type: 'number',
          minimum: 0.1,
          maximum: 10.0,
          description: 'Bid adjustment multiplier. 1.0 = no change (baseline). 1.5 = bid 50% more. 0.7 = bid 30% less. Range: 0.1 (−90%) to 10.0 (+1000%). Default when unspecified is typically 1.2 (+20%).',
        },
        priority: {
          type: 'number',
          minimum: 1,
          description: 'Evaluation order. Lower number = higher priority. When a user matches multiple rules, only the first (lowest priority number) rule applies. Order from most specific (1) to least specific.',
        },
        status: {
          type: 'string',
          enum: ['ENABLED', 'DISABLED'],
          description: 'ENABLED = active, DISABLED = paused. Default: ENABLED.',
        },
        campaign_id: {
          type: 'string',
          description: 'Optional — associate this rule with a specific campaign. If omitted, the rule is created at the account level and may apply to all eligible campaigns.',
        },
      },
      required: ['name', 'conditions', 'multiplier'],
    },
  },
  {
    name: 'meta_update_value_rule',
    description: `Update an existing Value Rule — change its multiplier, conditions, priority, status, or name. Only provide the fields you want to change. This is an ADVANCED optional feature — only call when the user explicitly asks.

This is a write operation — confirm with the user before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        value_rule_id: { type: 'string', description: 'ID of the value rule to update (from meta_list_value_rules)' },
        name: { type: 'string', description: 'New display name' },
        multiplier: {
          type: 'number',
          minimum: 0.1,
          maximum: 10.0,
          description: 'New bid multiplier (0.1–10.0)',
        },
        status: {
          type: 'string',
          enum: ['ENABLED', 'DISABLED'],
          description: 'ENABLED or DISABLED',
        },
        priority: {
          type: 'number',
          minimum: 1,
          description: 'New evaluation priority (lower = evaluated first)',
        },
        conditions: {
          type: 'array',
          description: 'Replace the full conditions array (same structure as meta_create_value_rule). Replaces all existing conditions.',
          minItems: 1,
          maxItems: 2,
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', enum: ['i_contains', 'i_not_contains'] },
              values: { type: 'array', items: { type: 'string' } },
            },
            required: ['field', 'operator', 'values'],
          },
        },
      },
      required: ['value_rule_id'],
    },
  },
  {
    name: 'meta_delete_value_rule',
    description: `Permanently delete a Value Rule. The rule stops influencing bids immediately. Cannot be undone. This is an ADVANCED optional feature — only call when the user explicitly asks.

Always confirm with the user before deleting.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        value_rule_id: { type: 'string', description: 'ID of the value rule to delete (from meta_list_value_rules)' },
      },
      required: ['value_rule_id'],
    },
  },
];

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleValueRulesTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_value_rules': return listValueRules(ctx, args);
    case 'meta_create_value_rule': return createValueRule(ctx, args);
    case 'meta_update_value_rule': return updateValueRule(ctx, args);
    case 'meta_delete_value_rule': return deleteValueRule(ctx, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──────────────────────────────────────────────────────────

async function listValueRules(ctx: TenantContext, args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/value_rules`, {
      fields: 'id,name,status,priority,conditions,value_adjustment',
      limit: args.limit ?? 25,
    }),
  );

  const rules = (result.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    priority: r.priority,
    multiplier: r.value_adjustment?.multiplier ?? null,
    multiplier_display: formatMultiplier(r.value_adjustment?.multiplier),
    conditions: (r.conditions ?? []).map((c: any) => ({
      field: c.field,
      operator: c.operator,
      values: c.values,
    })),
  }));

  return {
    value_rules: rules,
    total: rules.length,
    note: 'Value Rules are evaluated in priority order. Only the first matching rule applies per impression.',
  };
}

async function createValueRule(ctx: TenantContext, args: any): Promise<any> {
  if (ctx.dryRun) {
    const conditionSummary = (args.conditions as any[])
      .map((c: any) => `${c.field} ${c.operator} [${c.values.join(', ')}]`)
      .join(' AND ');
    return {
      dry_run: true,
      message: `Simulated: create value rule "${args.name}" — ${conditionSummary} → ${formatMultiplier(args.multiplier)}`,
    };
  }

  const conditions = (args.conditions as any[]).map((c: any) => ({
    field: c.field,
    operator: c.operator,
    values: c.values,
  }));

  const params: Record<string, any> = {
    name: args.name,
    conditions: JSON.stringify(conditions),
    value_adjustment: JSON.stringify({ multiplier: args.multiplier }),
    status: args.status ?? 'ENABLED',
  };

  if (args.priority != null) params.priority = args.priority;

  // Create at campaign level if campaign_id provided, else account level
  const endpoint = args.campaign_id
    ? `${args.campaign_id}/value_rules`
    : `${ctx.adAccountId}/value_rules`;

  const result = await rateLimitedCall(() => graphPost(ctx, endpoint, params));

  return {
    success: true,
    value_rule_id: result.id,
    name: args.name,
    multiplier: args.multiplier,
    multiplier_display: formatMultiplier(args.multiplier),
    status: args.status ?? 'ENABLED',
    conditions_count: conditions.length,
    ...(args.campaign_id && { campaign_id: args.campaign_id }),
    note: "Value Rules adjust Meta's bids in real time. Meta warns that overall CPA may increase — monitor performance after enabling.",
  };
}

async function updateValueRule(ctx: TenantContext, args: any): Promise<any> {
  const updates: string[] = [];
  const params: Record<string, any> = {};

  if (args.name) { params.name = args.name; updates.push(`name → "${args.name}"`); }
  if (args.status) { params.status = args.status; updates.push(`status → ${args.status}`); }
  if (args.priority != null) { params.priority = args.priority; updates.push(`priority → ${args.priority}`); }
  if (args.multiplier != null) {
    params.value_adjustment = JSON.stringify({ multiplier: args.multiplier });
    updates.push(`multiplier → ${formatMultiplier(args.multiplier)}`);
  }
  if (args.conditions) {
    params.conditions = JSON.stringify(args.conditions.map((c: any) => ({
      field: c.field,
      operator: c.operator,
      values: c.values,
    })));
    updates.push(`conditions replaced (${args.conditions.length} condition${args.conditions.length !== 1 ? 's' : ''})`);
  }

  if (Object.keys(params).length === 0) {
    return { success: false, error: 'No fields to update were provided.' };
  }

  if (ctx.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: update value rule ${args.value_rule_id} — ${updates.join(', ')}`,
    };
  }

  await rateLimitedCall(() => graphPost(ctx, args.value_rule_id, params));

  return {
    success: true,
    value_rule_id: args.value_rule_id,
    updated: updates,
  };
}

async function deleteValueRule(ctx: TenantContext, args: any): Promise<any> {
  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated: delete value rule ${args.value_rule_id}` };
  }

  await rateLimitedCall(() => graphDelete(ctx, args.value_rule_id));

  return {
    success: true,
    deleted_value_rule_id: args.value_rule_id,
    note: 'The rule has been permanently deleted and will no longer affect bidding.',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMultiplier(multiplier: number | null | undefined): string {
  if (multiplier == null) return 'unknown';
  if (multiplier === 1.0) return 'no change (1.0×)';
  if (multiplier > 1.0) {
    const pct = Math.round((multiplier - 1) * 100);
    return `+${pct}% (${multiplier}×)`;
  }
  const pct = Math.round((1 - multiplier) * 100);
  return `−${pct}% (${multiplier}×)`;
}
