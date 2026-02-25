import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet, graphPost, graphDelete } from '../utils/graph.js';

// ── Tool definitions ─────────────────────────────────────────────────────────

export const budgetScheduleTools = [
  {
    name: 'meta_list_budget_schedules',
    description: `List High Demand Period budget schedules for a CBO campaign. This is an ADVANCED optional feature — only use when the user explicitly asks about budget schedules or high demand periods.

High Demand Periods (budget schedules) let you pre-schedule a budget boost for specific time windows — Black Friday, Cyber Monday, flash sales, product launches, etc. — without manually editing the campaign at 3am. The boost automatically activates and expires on schedule.

This only works on campaigns with Campaign Budget Optimization (CBO) enabled. Use this tool to review existing schedules before creating new ones, or to find an ID for deletion.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The CBO campaign ID to list budget schedules for',
        },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'meta_create_budget_schedule',
    description: `Create a High Demand Period budget schedule on a CBO campaign — automatically boosts spend during a specific time window (e.g. Black Friday, a weekend flash sale, product launch day). This is an ADVANCED optional feature — only call when the user explicitly asks.

How it works: Meta temporarily increases the campaign's effective budget to the specified value (ABSOLUTE) or multiplies it by the specified factor (MULTIPLIER) during the scheduled window. The budget returns to normal automatically when the period ends.

Meta constraints:
- Campaign must have Campaign Budget Optimization (CBO) enabled
- Period must be at least 3 hours long
- ABSOLUTE budget cannot exceed 8× the campaign's daily budget
- Maximum 50 schedules per campaign
- Schedules cannot overlap

Confirm the following with the user before calling:
1. Which campaign? (must be CBO)
2. Start and end time (date + time + timezone)
3. Budget type: ABSOLUTE (fixed spend cap in account currency) or MULTIPLIER (e.g. 2.0 = double the budget)
4. Budget value (cents for ABSOLUTE, decimal for MULTIPLIER)

This is a write operation — confirm all details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'CBO campaign ID to attach the schedule to',
        },
        budget_value: {
          type: 'number',
          description: 'For ABSOLUTE: budget in account currency cents (e.g. 10000 = $100.00). For MULTIPLIER: decimal multiplier (e.g. 2.0 = 2× the current daily budget, 1.5 = 50% increase).',
        },
        budget_value_type: {
          type: 'string',
          enum: ['ABSOLUTE', 'MULTIPLIER'],
          description: 'ABSOLUTE = fixed budget cap in account currency for the period. MULTIPLIER = scale factor applied to the current daily budget (e.g. 2.0 doubles it). MULTIPLIER is usually simpler — no need to know the exact budget amount.',
        },
        time_start: {
          type: 'number',
          description: 'Unix timestamp (seconds) for when the boost should begin. Convert from a human date/time before passing. Example: 1732924800 = 2024-11-30 00:00:00 UTC.',
        },
        time_end: {
          type: 'number',
          description: 'Unix timestamp (seconds) for when the boost should end. Must be at least 3 hours after time_start. The budget automatically reverts to normal after this time.',
        },
      },
      required: ['campaign_id', 'budget_value', 'budget_value_type', 'time_start', 'time_end'],
    },
  },
  {
    name: 'meta_delete_budget_schedule',
    description: `Delete (cancel) a High Demand Period budget schedule. Use this to cancel a scheduled budget boost before it activates, or to remove one that is no longer needed. This is an ADVANCED optional feature — only call when the user explicitly asks.

If the period has already started, deleting it will end the boost immediately. Cannot be undone.

Always confirm with the user before deleting.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        budget_schedule_id: {
          type: 'string',
          description: 'ID of the budget schedule to delete (from meta_list_budget_schedules)',
        },
      },
      required: ['budget_schedule_id'],
    },
  },
];

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleBudgetScheduleTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_budget_schedules': return listBudgetSchedules(args);
    case 'meta_create_budget_schedule': return createBudgetSchedule(args);
    case 'meta_delete_budget_schedule': return deleteBudgetSchedule(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──────────────────────────────────────────────────────────

async function listBudgetSchedules(args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(`${args.campaign_id}/budget_schedules`, {
      fields: 'id,budget_value,budget_value_type,time_start,time_end,status',
    }),
  );

  const schedules = (result.data ?? []).map((s: any) => ({
    id: s.id,
    budget_value: s.budget_value,
    budget_value_type: s.budget_value_type,
    budget_display: formatBudgetValue(s.budget_value, s.budget_value_type),
    time_start: s.time_start,
    time_end: s.time_end,
    time_start_human: s.time_start ? new Date(s.time_start * 1000).toISOString() : null,
    time_end_human: s.time_end ? new Date(s.time_end * 1000).toISOString() : null,
    status: s.status ?? 'SCHEDULED',
  }));

  return {
    campaign_id: args.campaign_id,
    budget_schedules: schedules,
    total: schedules.length,
    note: 'Budget schedules only apply to campaigns with Campaign Budget Optimization (CBO) enabled. Maximum 50 schedules per campaign.',
  };
}

async function createBudgetSchedule(args: any): Promise<any> {
  // Basic validation
  const durationHours = (args.time_end - args.time_start) / 3600;
  if (durationHours < 3) {
    return {
      success: false,
      error: `Period duration is ${durationHours.toFixed(1)} hours. Meta requires at least 3 hours. Increase the end time.`,
    };
  }

  if (config.dryRun) {
    const startHuman = new Date(args.time_start * 1000).toISOString();
    const endHuman = new Date(args.time_end * 1000).toISOString();
    return {
      dry_run: true,
      message: `Simulated: create budget schedule on campaign ${args.campaign_id} — ${formatBudgetValue(args.budget_value, args.budget_value_type)} from ${startHuman} to ${endHuman} (${durationHours.toFixed(1)}h)`,
    };
  }

  const result = await rateLimitedCall(() =>
    graphPost(`${args.campaign_id}/budget_schedules`, {
      budget_value: args.budget_value,
      budget_value_type: args.budget_value_type,
      time_start: args.time_start,
      time_end: args.time_end,
    }),
  );

  const startHuman = new Date(args.time_start * 1000).toISOString();
  const endHuman = new Date(args.time_end * 1000).toISOString();

  return {
    success: true,
    budget_schedule_id: result.id,
    campaign_id: args.campaign_id,
    budget_value: args.budget_value,
    budget_value_type: args.budget_value_type,
    budget_display: formatBudgetValue(args.budget_value, args.budget_value_type),
    time_start_human: startHuman,
    time_end_human: endHuman,
    duration_hours: Math.round(durationHours * 10) / 10,
    note: 'The budget boost will activate automatically at the scheduled start time and revert to the original budget at the end time. Monitor delivery during the period.',
  };
}

async function deleteBudgetSchedule(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated: delete budget schedule ${args.budget_schedule_id}` };
  }

  await rateLimitedCall(() => graphDelete(args.budget_schedule_id));

  return {
    success: true,
    deleted_budget_schedule_id: args.budget_schedule_id,
    note: 'The schedule has been cancelled. If it was active, the budget has reverted to normal immediately.',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBudgetValue(value: number | null | undefined, type: string | null | undefined): string {
  if (value == null) return 'unknown';
  if (type === 'MULTIPLIER') {
    const pct = Math.round((value - 1) * 100);
    if (pct === 0) return `no change (${value}×)`;
    if (pct > 0) return `+${pct}% budget boost (${value}×)`;
    return `${pct}% budget reduction (${value}×)`;
  }
  // ABSOLUTE — value is in cents
  const dollars = (value / 100).toFixed(2);
  return `$${dollars} absolute budget cap`;
}
