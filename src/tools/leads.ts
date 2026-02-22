import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

// ── Local Graph API helpers ──

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
  const formBody = new URLSearchParams();
  formBody.append('access_token', config.accessToken);
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

// ── Tool definitions ──

export const leadsTools = [
  {
    name: 'meta_list_lead_forms',
    description: 'List lead generation forms for the ad account. Returns form name, status, and lead count. Use before creating a lead ad to find an existing form ID, or to check how many leads a form has collected.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
    },
  },
  {
    name: 'meta_create_lead_form',
    description: `Create a native Meta lead generation form attached to a Facebook Page. The form collects user info (name, email, phone, etc.) without leaving Facebook/Instagram. Use for OUTCOME_LEADS campaigns with lead_gen_type=INSTANT_FORM.

IMPORTANT — always confirm these details with the user before calling:
1. Which Facebook Page to attach the form to (page_id)?
2. What fields to collect? (email, phone, full_name, first_name, last_name, company_name, job_title, etc.)
3. Privacy policy URL (required by Meta)?
4. Any custom questions?
5. An intro/context card title and description (recommended for higher conversion)?

This is a write operation — confirm all details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        page_id: {
          type: 'string',
          description: 'Facebook Page ID to attach the form to. Ask the user which Page if not specified.',
        },
        name: { type: 'string', description: 'Internal name for the form (not shown to users)' },
        questions: {
          type: 'array',
          description: 'Fields to collect from users. Always ask the user which fields they need.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'EMAIL', 'PHONE', 'FULL_NAME', 'FIRST_NAME', 'LAST_NAME',
                  'CITY', 'STATE', 'ZIP', 'COUNTRY',
                  'COMPANY_NAME', 'JOB_TITLE', 'WORK_EMAIL', 'WORK_PHONE',
                  'CUSTOM',
                ],
                description: 'Field type. Use CUSTOM for a free-text question.',
              },
              label: {
                type: 'string',
                description: 'Display label for the field. Required for CUSTOM type.',
              },
              key: {
                type: 'string',
                description: 'Field identifier key (snake_case). Auto-generated for standard types if omitted.',
              },
            },
            required: ['type'],
          },
        },
        privacy_policy_url: {
          type: 'string',
          description: 'URL to the business privacy policy. Required by Meta for all lead forms. Ask the user if not provided.',
        },
        context_card_title: {
          type: 'string',
          description: 'Heading text shown on the intro card before the form fields (e.g. "Get a free quote"). Recommended — ask the user for this.',
        },
        context_card_body: {
          type: 'string',
          description: 'Body text on the intro card — briefly describe what the user gets by submitting (e.g. "We will contact you within 24 hours").',
        },
        thank_you_message: {
          type: 'string',
          description: 'Message shown after the user submits the form (e.g. "Thanks! We\'ll be in touch soon.").',
        },
      },
      required: ['page_id', 'name', 'privacy_policy_url'],
    },
  },
  {
    name: 'meta_get_leads',
    description: 'Retrieve leads (submissions) from a lead generation form. Returns each lead\'s field values (email, phone, name, etc.) and submission timestamp. Use after running a lead generation campaign to export the collected leads.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        form_id: {
          type: 'string',
          description: 'Lead form ID (from meta_list_lead_forms)',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Max leads to return (default 25)',
        },
        after: {
          type: 'string',
          description: 'Pagination cursor from a previous response',
        },
      },
      required: ['form_id'],
    },
  },
];

// ── Handler ──

export async function handleLeadsTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_lead_forms': return listLeadForms(args);
    case 'meta_create_lead_form': return createLeadForm(args);
    case 'meta_get_leads': return getLeads(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──

async function listLeadForms(args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(`${config.adAccountId}/leadgen_forms`, {
      fields: 'id,name,status,leads_count,created_time',
      limit: args.limit ?? 25,
    }),
  );

  return {
    forms: (result.data ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      leads_count: f.leads_count ?? 0,
      created: f.created_time,
    })),
  };
}

// Standard field keys for Meta lead gen
const STANDARD_KEYS: Record<string, string> = {
  EMAIL: 'email',
  PHONE: 'phone_number',
  FULL_NAME: 'full_name',
  FIRST_NAME: 'first_name',
  LAST_NAME: 'last_name',
  CITY: 'city',
  STATE: 'state',
  ZIP: 'zip',
  COUNTRY: 'country',
  COMPANY_NAME: 'company_name',
  JOB_TITLE: 'job_title',
  WORK_EMAIL: 'work_email',
  WORK_PHONE: 'work_phone_number',
};

async function createLeadForm(args: any): Promise<any> {
  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: create lead form "${args.name}" on page ${args.page_id}`,
      fields_count: (args.questions ?? []).length,
    };
  }

  const questions = (args.questions ?? []).map((q: any) => {
    const key = q.key ?? STANDARD_KEYS[q.type] ?? q.type.toLowerCase();
    const question: Record<string, any> = { type: q.type, key };
    if (q.label) question.label = q.label;
    return question;
  });

  // Require at least an email or phone
  const hasContactField = questions.some((q: any) =>
    ['EMAIL', 'PHONE', 'FULL_NAME'].includes(q.type),
  );
  if (!hasContactField && questions.length > 0) {
    return {
      success: false,
      error: 'Lead forms should include at least one of: EMAIL, PHONE, or FULL_NAME. Ask the user to confirm the fields they need.',
    };
  }

  const formParams: Record<string, any> = {
    name: args.name,
    privacy_policy: JSON.stringify({ url: args.privacy_policy_url }),
    ...(questions.length > 0 && { questions: JSON.stringify(questions) }),
  };

  // Context card (intro screen)
  if (args.context_card_title || args.context_card_body) {
    formParams.context_card = JSON.stringify({
      style: 'LIST_STYLE',
      ...(args.context_card_title && { title: args.context_card_title }),
      ...(args.context_card_body && { content: [args.context_card_body] }),
    });
  }

  if (args.thank_you_message) {
    formParams.thank_you_action = JSON.stringify({
      body: { text: args.thank_you_message },
    });
  }

  const result = await rateLimitedCall(() => graphPost(`${args.page_id}/leadgen_forms`, formParams));

  return {
    success: true,
    form_id: result.id,
    form_name: args.name,
    page_id: args.page_id,
    fields_collected: questions.map((q: any) => q.key),
    note: 'Use this form_id as the lead_gen_form_id when creating OUTCOME_LEADS ads with creative_type=lead_form.',
  };
}

async function getLeads(args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'id,created_time,field_data',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() => graphGet(`${args.form_id}/leads`, params));

  const leads = (result.data ?? []).map((lead: any) => {
    // Convert field_data array to a flat key-value object
    const fields: Record<string, string> = {};
    for (const entry of lead.field_data ?? []) {
      fields[entry.name] = Array.isArray(entry.values) ? entry.values[0] : entry.values;
    }
    return {
      id: lead.id,
      submitted_at: lead.created_time,
      ...fields,
    };
  });

  return {
    form_id: args.form_id,
    leads,
    total_returned: leads.length,
    ...(result.paging?.cursors?.after && result.paging?.next
      ? { next_cursor: result.paging.cursors.after }
      : {}),
  };
}
