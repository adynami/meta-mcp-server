import { config } from '../config.js';

export const copyTools = [
  {
    name: 'meta_generate_ad_copy',
    description: `Generate Meta ad copy variants with proper character limits, hook frameworks, and DCO-ready output. Use before deploying campaigns to get headlines, body copy, and CTA recommendations optimised for Meta feed.

Returns variants with character counts, truncation previews, and a dco_ready object with arrays ready to pass directly to meta_deploy_dco_campaign.

Requires GEMINI_API_KEY in meta-mcp-server env. Returns graceful error if not set.`,
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
          description: 'Number of copy variants to generate (default: 1; use 3–5 for DCO testing)',
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

const HOOK_FRAMEWORKS = `
Hook framework definitions (use the requested style):
- question: Open with a direct question the audience mentally answers "yes" to
- stat: Lead with a specific, credible statistic that creates urgency or proof
- before_after: Contrast the painful before state with the desired after state
- fomo: Tap into fear of missing out — limited time, exclusive, others are doing it
- benefit: Lead directly with the primary quantified benefit, no fluff
- pattern_interrupt: Unexpected or surprising opener that stops the scroll
`;

const META_CHARACTER_GUIDE = `
Meta ad character limits and best practices:
- Headline: 27 characters IDEAL (fits without truncation on most placements), 40 characters MAX before truncation risk
- Body copy: 125 characters MAX before "See more" truncation on mobile feed
- Primary text (body): Keep the hook + core benefit in the first 125 chars; additional detail can follow
- CTA button: Use platform CTA options, not custom text in copy
`;

const OBJECTIVE_CTAS: Record<string, string[]> = {
  OUTCOME_AWARENESS: ['LEARN_MORE', 'WATCH_MORE', 'SEE_MORE'],
  ENGAGEMENT: ['LIKE_PAGE', 'FOLLOW_PAGE', 'SEND_MESSAGE', 'COMMENT'],
  LEADS: ['SIGN_UP', 'SUBSCRIBE', 'GET_QUOTE', 'LEARN_MORE'],
  SALES: ['SHOP_NOW', 'BUY_NOW', 'ORDER_NOW', 'GET_OFFER'],
  TRAFFIC: ['LEARN_MORE', 'VISIT_WEBSITE', 'BOOK_NOW', 'APPLY_NOW'],
};

const COPY_GENERATION_SYSTEM_PROMPT = `You are an expert Meta (Facebook/Instagram) advertising copywriter. Generate high-converting ad copy following these rules:

${META_CHARACTER_GUIDE}

${HOOK_FRAMEWORKS}

Copywriting rules:
1. Benefits over features — say what the user GETS, not what the product DOES
2. Specificity beats generality — "saves 5 hours/week" beats "saves time"
3. One idea per ad — do not try to communicate everything
4. Match the hook style requested exactly
5. Avoid colour mentions in CTAs (do not say "click the blue button" — blends with Meta UI)
6. Avoid overused words: "revolutionary", "game-changing", "amazing", "incredible"
7. For SALES objective: include price anchor, trial, or risk-reversal when possible
8. For LEADS objective: emphasise what they get, not what they give up (no "just fill out the form")
9. For AWARENESS objective: prioritise memorability and brand association over direct response

Output ONLY valid JSON matching this exact structure — no markdown, no explanation:
{
  "variants": [
    {
      "headline": "string (aim for ≤27 chars, never exceed 40)",
      "headline_chars": number,
      "body": "string (aim for ≤125 chars for above-fold visibility)",
      "body_chars": number,
      "body_truncated_preview": "string (first 125 chars of body + '...' if body exceeds 125)",
      "call_to_action": "string (one of the platform CTA options for the objective)",
      "hook_used": "string (which hook framework was used)",
      "notes": "string (brief explanation of the creative rationale)"
    }
  ],
  "character_guide": {
    "headline_ideal": 27,
    "headline_max": 40,
    "body_max_before_see_more": 125
  },
  "dco_ready": {
    "headlines": ["array of all variant headlines"],
    "bodies": ["array of all variant bodies"]
  },
  "next_step": "string (actionable next step referencing meta_deploy_campaign or meta_deploy_dco_campaign)"
}`;

async function callGeminiForCopy(userPrompt: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: COPY_GENERATION_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.85,
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

export async function handleCopyTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_generate_ad_copy': return generateAdCopy(args);
    default: throw new Error(`Unknown copy tool: ${name}`);
  }
}

async function generateAdCopy(args: any): Promise<any> {
  if (!config.geminiApiKey) {
    return {
      success: false,
      error: 'GEMINI_API_KEY required for copy generation. Add to meta-mcp-server env.',
    };
  }

  const variantCount = args.variants ?? 1;
  const suggestedCTAs = OBJECTIVE_CTAS[args.objective] ?? ['LEARN_MORE'];

  const userPrompt = `Generate ${variantCount} Meta ad copy variant${variantCount > 1 ? 's' : ''} for:

Product/Service: ${args.product_or_service}
Campaign Objective: ${args.objective}
${args.target_audience ? `Target Audience: ${args.target_audience}` : ''}
${args.hook_style ? `Hook Style: ${args.hook_style} (use this framework for ALL variants)` : ''}
${args.key_benefits?.length ? `Key Benefits to highlight: ${args.key_benefits.join(', ')}` : ''}
${args.brand_voice ? `Brand Voice: ${args.brand_voice}` : ''}
${args.link_url ? `Landing Page: ${args.link_url}` : ''}

Recommended CTA options for ${args.objective}: ${suggestedCTAs.join(', ')}

${variantCount > 1 ? `Generate exactly ${variantCount} distinct variants — each with a different angle or hook execution.` : ''}`;

  const result = await callGeminiForCopy(userPrompt);

  // Ensure next_step is helpful
  if (!result.next_step) {
    result.next_step = variantCount > 1
      ? 'Review variants, then pass headlines and bodies arrays from dco_ready to meta_deploy_dco_campaign.'
      : 'Review this variant, then pass headline and body to meta_deploy_campaign.';
  }

  return result;
}
