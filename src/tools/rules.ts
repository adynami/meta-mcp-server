import type { TenantContext } from '../tenant-context.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet, graphPost, graphDelete } from '../utils/graph.js';

// ── Tool definitions ──

export const rulesTools = [
  {
    name: 'meta_list_rules',
    description: 'List automated rules configured in the ad account. Returns rule name, status, action type, conditions, and schedule. Use to review what automation is currently running before creating or deleting rules. Use response_format=concise when you only need IDs and names.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
          description: 'concise = id+name+status only, detailed = all fields including conditions and schedule (default: detailed)',
        },
      },
    },
  },
  {
    name: 'meta_create_rule',
    description: `Create an automated rule that monitors ad performance and executes actions automatically (pause, resume, adjust budget/bid) when conditions are met.

IMPORTANT — before calling, always confirm all of the following with the user:
1. Which entity type to monitor: CAMPAIGN, ADSET, or AD?
2. What metric to watch and what threshold? (e.g. cost_per_result > 50, spend > 1000, roas < 1.5)
3. What action to take when triggered? (PAUSE, UNPAUSE, INCREASE_DAILY_BUDGET, DECREASE_DAILY_BUDGET, INCREASE_BID, DECREASE_BID)
4. For budget/bid actions: by what percentage?
5. How often to evaluate: SEMI_HOURLY, HOURLY, EVERY_6_HOURS, EVERY_12_HOURS, DAILY, or WEEKLY?
6. Over what time window: TODAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS?

This is a write operation — confirm all details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Human-readable name for the rule (e.g. "Pause high-CPA ad sets")' },
        entity_type: {
          type: 'string',
          enum: ['CAMPAIGN', 'ADSET', 'AD'],
          description: 'Which entity type this rule applies to. Ask the user if not specified.',
        },
        action: {
          type: 'string',
          enum: ['PAUSE', 'UNPAUSE', 'INCREASE_DAILY_BUDGET', 'DECREASE_DAILY_BUDGET', 'INCREASE_BID', 'DECREASE_BID', 'SEND_ALERT'],
          description: 'Action to execute when conditions are met. Ask the user if not specified.',
        },
        action_value: {
          type: 'number',
          description: 'Percentage for budget/bid actions (e.g. 20 = increase by 20%). Not needed for PAUSE/UNPAUSE/SEND_ALERT. Ask the user if the action is a percentage change.',
        },
        schedule: {
          type: 'string',
          enum: ['SEMI_HOURLY', 'HOURLY', 'EVERY_6_HOURS', 'EVERY_12_HOURS', 'DAILY', 'WEEKLY'],
          description: 'How often to evaluate the rule. Default: DAILY. Ask the user if not specified.',
        },
        evaluation_window: {
          type: 'string',
          enum: ['TODAY', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS'],
          description: 'Lookback window for condition evaluation. Default: LAST_7_DAYS. Ask the user if not specified.',
        },
        conditions: {
          type: 'array',
          description: 'Conditions that must ALL be true to trigger the action. At least one condition required. Ask the user: what metric, what comparison, and what value for each condition.',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: 'Metric to evaluate. Common: cost_per_result, impressions, spend, reach, clicks, ctr, roas, cpm, cpp, frequency.',
              },
              operator: {
                type: 'string',
                enum: ['GREATER_THAN', 'LESS_THAN', 'EQUAL', 'NOT_EQUAL', 'IN_RANGE', 'NOT_IN_RANGE'],
                description: 'Comparison operator',
              },
              value: {
                type: 'number',
                description: 'Threshold for the comparison (e.g. 50 for cost_per_result > 50)',
              },
            },
            required: ['field', 'operator', 'value'],
          },
        },
      },
      required: ['name', 'entity_type', 'action', 'conditions'],
    },
  },
  {
    name: 'meta_update_rule',
    description: 'Enable, disable, or rename an automated rule. Use to pause/resume a rule without permanently deleting it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'string', description: 'Rule ID to update (from meta_list_rules)' },
        status: {
          type: 'string',
          enum: ['ENABLED', 'DISABLED'],
          description: 'New status for the rule',
        },
        name: { type: 'string', description: 'New name for the rule (optional)' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'meta_delete_rule',
    description: 'Permanently delete an automated rule. The rule stops executing immediately. Cannot be undone. Always confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'string', description: 'Rule ID to delete (from meta_list_rules)' },
      },
      required: ['rule_id'],
    },
  },
];

// ── Handler ──

export async function handleRulesTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_rules': return listRules(ctx, args);
    case 'meta_create_rule': return createRule(ctx, args);
    case 'meta_update_rule': return updateRule(ctx, args);
    case 'meta_delete_rule': return deleteRule(ctx, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──

async function listRules(ctx: TenantContext, args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/adrules_library`, {
      fields: 'id,name,status,evaluation_spec,execution_spec,schedule_spec,entity_type',
      limit: args.limit ?? 25,
    }),
  );

  const concise = args.response_format === 'concise';
  const rules = (result.data ?? []).map((r: any) => concise
    ? { id: r.id, name: r.name, status: r.status }
    : {
        id: r.id,
        name: r.name,
        status: r.status,
        entity_type: r.entity_type,
        action: r.execution_spec?.execution_type,
        schedule: r.schedule_spec?.schedule,
        evaluation_window: r.evaluation_spec?.evaluation_window,
        conditions: (r.evaluation_spec?.filters ?? []).map(
          (f: any) => `${f.field} ${f.operator} ${f.value?.value ?? f.value}`,
        ),
      });

  return { rules, total: rules.length };
}

async function createRule(ctx: TenantContext, args: any): Promise<any> {
  if (ctx.dryRun) {
    const conditionSummary = (args.conditions ?? [])
      .map((c: any) => `${c.field} ${c.operator} ${c.value}`)
      .join(' AND ');
    return {
      dry_run: true,
      message: `Simulated: create rule "${args.name}" — ${args.action} when ${conditionSummary}`,
    };
  }

  const schedule = args.schedule ?? 'DAILY';
  const evaluationWindow = args.evaluation_window ?? 'LAST_7_DAYS';

  const evaluation_spec: Record<string, any> = {
    type: 'SCHEDULE',
    evaluation_window: evaluationWindow,
    filters: (args.conditions as any[]).map((c) => ({
      field: c.field,
      operator: c.operator,
      value: { type: 'NUMERIC', value: c.value },
    })),
  };

  const execution_options: any[] = [{ type: 'NOTIFICATION' }];
  if (
    args.action_value != null &&
    ['INCREASE_DAILY_BUDGET', 'DECREASE_DAILY_BUDGET', 'INCREASE_BID', 'DECREASE_BID'].includes(args.action)
  ) {
    execution_options.push({ type: 'PERCENTAGE', value: args.action_value });
  }

  const execution_spec: Record<string, any> = {
    execution_type: args.action,
    execution_options,
  };

  const result = await rateLimitedCall(() =>
    graphPost(ctx, `${ctx.adAccountId}/adrules_library`, {
      name: args.name,
      entity_type: args.entity_type,
      evaluation_spec,
      execution_spec,
      schedule_spec: { schedule },
    }),
  );

  return {
    success: true,
    rule_id: result.id,
    name: args.name,
    entity_type: args.entity_type,
    action: args.action,
    ...(args.action_value != null && { action_value: `${args.action_value}%` }),
    schedule,
    evaluation_window: evaluationWindow,
    conditions_count: args.conditions.length,
  };
}

async function updateRule(ctx: TenantContext, args: any): Promise<any> {
  if (!args.status && !args.name) {
    return { success: false, error: 'Provide at least one of: status or name to update.' };
  }
  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated: update rule ${args.rule_id}${args.status ? ` → ${args.status}` : ''}${args.name ? ` rename to "${args.name}"` : ''}` };
  }

  const updates: Record<string, any> = {};
  if (args.status) updates.status = args.status;
  if (args.name) updates.name = args.name;

  await rateLimitedCall(() => graphPost(ctx, args.rule_id, updates));
  return {
    success: true,
    rule_id: args.rule_id,
    ...(args.status && { status: args.status }),
    ...(args.name && { name: args.name }),
  };
}

async function deleteRule(ctx: TenantContext, args: any): Promise<any> {
  if (ctx.dryRun) {
    return { dry_run: true, message: `Simulated: delete rule ${args.rule_id}` };
  }
  await rateLimitedCall(() => graphDelete(ctx, args.rule_id));
  return { success: true, deleted_rule_id: args.rule_id };
}
