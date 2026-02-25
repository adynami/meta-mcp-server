import type { TenantContext } from '../tenant-context.js';

// -- Tool definition --

export const briefTools = [
  {
    name: 'meta_generate_creative_brief',
    description: `Generate a structured creative brief from any signal: account performance data, competitor ads, or a plain-text prompt. The brief object is the canonical input format for meta_generate_ad_copy and imagen_generate_ad — everything downstream consumes it.

Three signal modes:
- from_analytics: paste the JSON output of meta_account_intelligence or meta_get_breakdown_insights. Analyses what's working, identifies untested angles, and recommends the next creative hypothesis.
- from_competitor: paste the JSON output of meta_search_ad_library. Maps the competitive landscape, finds gaps, and recommends a differentiation angle.
- from_prompt: write a plain-text brief. Structures it into the canonical format and fills in gaps using best-practice defaults.

The loop activation point: meta_analyze_creative_performance also returns a next_brief object in this same format, ready to pass straight back here to close the iteration loop.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        signal_type: {
          type: 'string',
          enum: ['from_analytics', 'from_competitor', 'from_prompt'],
          description: 'Source of the creative signal',
        },
        signal_data: {
          type: 'string',
          description: 'The signal content. For from_analytics or from_competitor: paste the JSON output of the relevant tool as a string. For from_prompt: write a plain-text brief describing the product, goal, and any creative direction.',
        },
        product_or_service: {
          type: 'string',
          description: 'What is being advertised — required for from_prompt; optional (but helpful) for the other modes if not already clear from the signal data.',
        },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'TRAFFIC'],
          description: 'Campaign objective — guides toward appropriate angles and CTA recommendations.',
        },
        constraints: {
          type: 'string',
          description: 'Optional guardrails: "do not mention competitors by name", "must include price point", "brand voice: playful, never corporate", etc.',
        },
      },
      required: ['signal_type', 'signal_data'],
    },
  },
];

// -- Signal mode instructions --

const MODE_INSTRUCTIONS: Record<string, string> = {
  from_analytics: `Signal type: ACCOUNT PERFORMANCE DATA
Analyse this Meta account performance data to identify the highest-leverage creative opportunity.
Look for: underperforming campaigns with high spend (bleeders), winning campaigns that could inform new angles, untested formats or audiences, and patterns in CTR/CPA that suggest a specific message is resonating or not.`,

  from_competitor: `Signal type: COMPETITOR AD LIBRARY DATA
Analyse this competitor ad data from the Meta Ad Library to identify a differentiation opportunity.
Look for: dominant hooks/angles competitors are using (so we can avoid them or counter-position), formats they are NOT testing, audiences they are NOT speaking to, claims they make that we can validate or undercut with specifics.`,

  from_prompt: `Signal type: USER BRIEF / PROMPT
Structure this raw brief into the canonical format. Fill in any missing fields with performance-marketing best practices.
If the prompt lacks specifics (audience, angle, format), make the strongest defensible assumptions and note them in the reasoning field.`,
};

// -- Strategy guidelines --

const STRATEGY_RULES = [
  'Specificity wins. "marketing managers who use Salesforce" beats "business professionals".',
  'One clear angle per brief. Do not hedge with multiple directions — pick the strongest one and commit.',
  'Identify the gap. For competitor signals: what angle are they NOT using? Lead there.',
  'For analytics signals: what\'s underperforming that has high spend? What\'s winning that could scale? The next test should either double down on a winner or fix the biggest bleeder.',
  'The "reasoning" field must explain WHY this angle — cite specific data points from the signal.',
  '"variants_to_test" should be 3 for initial launches, 1 for iteration on a known winner.',
];

const BRIEF_OUTPUT_SCHEMA = {
  brief: {
    product: 'string — specific product/service name',
    objective: 'string — one of: OUTCOME_AWARENESS | ENGAGEMENT | LEADS | SALES | TRAFFIC',
    audience: 'string — specific audience description (demographics, psychographics, platform behaviour)',
    angle: 'string — the core creative angle in one sentence',
    hook_style: 'string — one of: question | stat | before_after | fomo | benefit | pattern_interrupt',
    visual_direction: 'string — 1-2 sentences: format, subject, mood, colour, composition notes',
    copy_direction: 'string — 1-2 sentences: what the copy should lead with and why',
    key_benefits: ['array of 1-3 specific benefit strings to highlight'],
    formats: ['array of aspect ratio strings — lead with the best format first (4:5, 1:1, 9:16)'],
    variants_to_test: 'number — 1 to 5',
    brand_voice: 'string — tone and style guidance (or null if unknown)',
  },
  reasoning: 'string — 2-4 sentences citing specific data points from the signal that led to this brief',
  signal_summary: 'string — 1-2 sentence summary of what the signal showed',
  next_step: 'string — exact next tool call to make with key params',
  loop_note: 'string — what to measure after launch to determine if this hypothesis was correct',
};

// -- Handler --

export async function handleBriefTool(_ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_generate_creative_brief': return generateCreativeBrief(args);
    default: throw new Error(`Unknown brief tool: ${name}`);
  }
}

function generateCreativeBrief(args: any): any {
  const modeContext = MODE_INSTRUCTIONS[args.signal_type] ?? MODE_INSTRUCTIONS.from_prompt;

  return {
    signal_type: args.signal_type,
    signal_data: args.signal_data,
    product_or_service: args.product_or_service ?? null,
    objective: args.objective ?? null,
    constraints: args.constraints ?? null,
    mode_instructions: modeContext,
    strategy_rules: STRATEGY_RULES,
    output_schema: BRIEF_OUTPUT_SCHEMA,
    hook_style_options: ['question', 'stat', 'before_after', 'fomo', 'benefit', 'pattern_interrupt'],
    visual_format_options: ['4:5 (top-performing feed)', '1:1 (feed fallback)', '9:16 (stories/reels)'],
    objective_options: ['OUTCOME_AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'TRAFFIC'],
    next_step: 'Use the signal data and these instructions to generate a creative brief matching the output_schema. Then pass the brief to meta_generate_ad_copy and/or imagen_generate_ad.',
  };
}
