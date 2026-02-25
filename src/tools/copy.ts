import type { TenantContext } from '../tenant-context.js';

export const copyTools = [
  {
    name: 'meta_generate_ad_copy',
    description: `Generate structured ad copy inputs for Meta campaigns. Returns product info, hook frameworks, character constraints, and CTA recommendations that Claude uses to produce final ad copy variants with proper character limits and DCO-ready output.

Use before deploying campaigns to get headlines, body copy, and CTA recommendations optimised for Meta feed.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        product_or_service: {
          type: 'string',
          description: 'What you are advertising — be specific (e.g. "AI reporting tool for marketing agencies")',
        },
        objective: {
          type: 'string',
          enum: ['OUTCOME_AWARENESS', 'ENGAGEMENT', 'LEADS', 'SALES', 'TRAFFIC'],
          description: 'Campaign objective — affects CTA recommendations and copy angle',
        },
        target_audience: {
          type: 'string',
          description: 'Who this ad is for (e.g. "small business owners aged 30-50 who use QuickBooks")',
        },
        hook_style: {
          type: 'string',
          enum: ['question', 'stat', 'before_after', 'fomo', 'benefit', 'pattern_interrupt'],
          description: 'Opening hook framework to use',
        },
        key_benefits: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: 'Up to 3 key benefits to highlight (e.g. ["saves 5 hours/week", "no credit card required", "integrates with Slack"])',
        },
        brand_voice: {
          type: 'string',
          description: 'Brand tone/voice guidance (e.g. "professional but approachable, no jargon")',
        },
        variants: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Number of copy variants to generate (default: 1; use 3-5 for DCO testing)',
        },
        link_url: {
          type: 'string',
          description: 'Landing page URL — used to inform CTA copy',
        },
      },
      required: ['product_or_service', 'objective'],
    },
  },
];

const HOOK_FRAMEWORKS: Record<string, string> = {
  question: 'Open with a direct question the audience mentally answers "yes" to',
  stat: 'Lead with a specific, credible statistic that creates urgency or proof',
  before_after: 'Contrast the painful before state with the desired after state',
  fomo: 'Tap into fear of missing out — limited time, exclusive, others are doing it',
  benefit: 'Lead directly with the primary quantified benefit, no fluff',
  pattern_interrupt: 'Unexpected or surprising opener that stops the scroll',
};

const META_CHARACTER_GUIDE = {
  headline_ideal: 27,
  headline_max_before_truncation: 40,
  body_max_before_see_more: 125,
  notes: [
    'Headline: 27 characters IDEAL (fits without truncation on most placements), 40 characters MAX before truncation risk',
    'Body copy: 125 characters MAX before "See more" truncation on mobile feed',
    'Primary text (body): Keep the hook + core benefit in the first 125 chars; additional detail can follow',
    'CTA button: Use platform CTA options, not custom text in copy',
  ],
};

const OBJECTIVE_CTAS: Record<string, string[]> = {
  OUTCOME_AWARENESS: ['LEARN_MORE', 'WATCH_MORE', 'SEE_MORE'],
  ENGAGEMENT: ['LIKE_PAGE', 'FOLLOW_PAGE', 'SEND_MESSAGE', 'COMMENT'],
  LEADS: ['SIGN_UP', 'SUBSCRIBE', 'GET_QUOTE', 'LEARN_MORE'],
  SALES: ['SHOP_NOW', 'BUY_NOW', 'ORDER_NOW', 'GET_OFFER'],
  TRAFFIC: ['LEARN_MORE', 'VISIT_WEBSITE', 'BOOK_NOW', 'APPLY_NOW'],
};

const COPYWRITING_RULES = [
  'Benefits over features — say what the user GETS, not what the product DOES',
  'Specificity beats generality — "saves 5 hours/week" beats "saves time"',
  'One idea per ad — do not try to communicate everything',
  'Match the hook style requested exactly',
  'Avoid colour mentions in CTAs (do not say "click the blue button" — blends with Meta UI)',
  'Avoid overused words: "revolutionary", "game-changing", "amazing", "incredible"',
  'For SALES objective: include price anchor, trial, or risk-reversal when possible',
  'For LEADS objective: emphasise what they get, not what they give up (no "just fill out the form")',
  'For AWARENESS objective: prioritise memorability and brand association over direct response',
];

export async function handleCopyTool(_ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_generate_ad_copy': return generateAdCopy(args);
    default: throw new Error(`Unknown copy tool: ${name}`);
  }
}

function generateAdCopy(args: any): any {
  const variantCount = args.variants ?? 1;
  const suggestedCTAs = OBJECTIVE_CTAS[args.objective] ?? ['LEARN_MORE'];
  const hookDescription = args.hook_style ? HOOK_FRAMEWORKS[args.hook_style] ?? null : null;

  return {
    product_or_service: args.product_or_service,
    objective: args.objective,
    target_audience: args.target_audience ?? null,
    hook_style: args.hook_style ?? null,
    hook_description: hookDescription,
    all_hook_frameworks: HOOK_FRAMEWORKS,
    key_benefits: args.key_benefits ?? [],
    brand_voice: args.brand_voice ?? null,
    link_url: args.link_url ?? null,
    variants_requested: variantCount,
    recommended_ctas: suggestedCTAs,
    character_guide: META_CHARACTER_GUIDE,
    copywriting_rules: COPYWRITING_RULES,
    output_format: {
      description: 'Generate ad copy variants matching this structure',
      variant_schema: {
        headline: 'string (aim for <=27 chars, never exceed 40)',
        headline_chars: 'number',
        body: 'string (aim for <=125 chars for above-fold visibility)',
        body_chars: 'number',
        body_truncated_preview: 'string (first 125 chars of body + "..." if body exceeds 125)',
        call_to_action: 'string (one of the recommended_ctas)',
        hook_used: 'string (which hook framework was used)',
        notes: 'string (brief explanation of the creative rationale)',
      },
      include_dco_ready: variantCount > 1,
      dco_ready_schema: {
        headlines: 'array of all variant headlines',
        bodies: 'array of all variant bodies',
      },
    },
    next_step: variantCount > 1
      ? 'After generating variants, pass headlines and bodies arrays to meta_deploy_dco_campaign.'
      : 'After generating the variant, pass headline and body to meta_deploy_campaign.',
  };
}
