import { createHash } from 'node:crypto';
import { config } from '../config.js';
import {
  createCustomAudience,
  addUsersToAudience,
  fetchAudiences,
  deleteAudience,
} from '../meta-client.js';

export const audienceTools = [
  {
    name: 'meta_list_audiences',
    description: 'List custom audiences in the ad account. Returns name, type, approximate size, and delivery status. Use when the user asks what audiences exist, wants to find an audience ID for targeting, or needs to check audience health.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
      },
    },
  },
  {
    name: 'meta_create_customer_audience',
    description: `Create a custom audience from a customer list (emails or phone numbers). Provide plaintext values — the server normalises and SHA-256 hashes them before sending to Meta. Use to retarget existing customers or build a seed audience for lookalikes. Minimum 100 matched users for delivery; 1,000+ recommended for best results.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Audience name' },
        description: { type: 'string', description: 'Optional description' },
        emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Plaintext email addresses — normalised to lowercase and SHA-256 hashed before upload',
        },
        phones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Phone numbers in any format — non-digits stripped, then SHA-256 hashed',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'meta_create_lookalike_audience',
    description: `Create a Lookalike Audience — Meta finds users similar to a seed audience using machine learning. Requires an existing custom audience as the seed (1,000–5,000 users recommended). Use when the user wants to expand reach to new people who resemble existing customers.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Audience name' },
        source_audience_id: { type: 'string', description: 'ID of the seed custom audience' },
        country: { type: 'string', description: '2-letter ISO country code for the target market (e.g. "US")' },
        ratio: {
          type: 'number',
          minimum: 0.01,
          maximum: 0.20,
          description: 'Size as fraction of country population. 0.01 = top 1% most similar (smallest, highest quality). 0.10 = top 10% (larger, broader). Default: 0.01',
        },
        type: {
          type: 'string',
          enum: ['similarity', 'reach'],
          description: 'similarity = prioritise match quality (default), reach = prioritise audience size',
        },
      },
      required: ['name', 'source_audience_id', 'country'],
    },
  },
  {
    name: 'meta_delete_audience',
    description: 'Permanently delete a custom audience. Cannot be undone. The audience will be removed from any active ad sets using it. Confirm with the user before calling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        audience_id: { type: 'string', description: 'Audience ID to delete' },
      },
      required: ['audience_id'],
    },
  },
];

export async function handleAudienceTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_audiences': return listAudiences(args);
    case 'meta_create_customer_audience': return createFromCustomerList(args);
    case 'meta_create_lookalike_audience': return createLookalike(args);
    case 'meta_delete_audience': return removeAudience(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function listAudiences(args: any): Promise<any> {
  const rows = await fetchAudiences({ limit: args.limit ?? 25, after: args.after });
  return {
    audiences: rows.map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.subtype,
      approx_size: a.approximate_count_lower_bound != null
        ? `${Number(a.approximate_count_lower_bound).toLocaleString()}–${Number(a.approximate_count_upper_bound ?? 0).toLocaleString()}`
        : 'unknown',
      source: a.data_source?.type ?? null,
      delivery_status: a.delivery_status?.description ?? null,
      created: a.time_created,
      updated: a.time_updated,
    })),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string): string {
  // Strip all non-digit characters
  return phone.replace(/\D/g, '');
}

async function createFromCustomerList(args: any): Promise<any> {
  const emails: string[] = args.emails ?? [];
  const phones: string[] = args.phones ?? [];

  if (emails.length === 0 && phones.length === 0) {
    return { success: false, error: 'Provide at least one email or phone number.' };
  }

  // Create the audience shell
  const audience = await createCustomAudience({
    name: args.name,
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
    ...(args.description && { description: args.description }),
  });

  const audienceId = audience.id;

  let result: any;

  if (emails.length > 0 && phones.length === 0) {
    // Emails only
    result = await addUsersToAudience(audienceId, {
      schema: 'EMAIL_SHA256',
      data: emails.map(e => sha256(normalizeEmail(e))),
    });
  } else if (phones.length > 0 && emails.length === 0) {
    // Phones only
    result = await addUsersToAudience(audienceId, {
      schema: 'PHONE_SHA256',
      data: phones.map(p => sha256(normalizePhone(p))),
    });
  } else {
    // Both — zip them (pad shorter list with empty string)
    const len = Math.max(emails.length, phones.length);
    const data: string[][] = [];
    for (let i = 0; i < len; i++) {
      const e = emails[i] ? sha256(normalizeEmail(emails[i])) : '';
      const p = phones[i] ? sha256(normalizePhone(phones[i])) : '';
      data.push([e, p]);
    }
    result = await addUsersToAudience(audienceId, {
      schema: ['EMAIL_SHA256', 'PHONE_SHA256'],
      data,
    });
  }

  return {
    success: true,
    audience_id: audienceId,
    audience_name: args.name,
    records_submitted: emails.length || phones.length,
    matched: result.num_received ?? null,
    invalid: result.num_invalid_entries ?? null,
    note: 'Audience takes up to 30 minutes to populate. Minimum 100 matched users required for ad delivery.',
  };
}

async function createLookalike(args: any): Promise<any> {
  const ratio = args.ratio ?? 0.01;
  const type = args.type ?? 'similarity';

  const result = await createCustomAudience({
    name: args.name,
    subtype: 'LOOKALIKE',
    origin_audience_id: args.source_audience_id,
    lookalike_spec: JSON.stringify({
      type,
      ratio,
      country: args.country,
    }),
  });

  return {
    success: true,
    audience_id: result.id,
    audience_name: args.name,
    source_audience_id: args.source_audience_id,
    country: args.country,
    ratio: `${(ratio * 100).toFixed(0)}%`,
    type,
    note: 'Lookalike audience takes 1–6 hours to populate.',
  };
}

async function removeAudience(args: any): Promise<any> {
  if (config.dryRun) {
    return { dry_run: true, message: `Simulated: delete audience ${args.audience_id}` };
  }
  await deleteAudience(args.audience_id);
  return { success: true, deleted_audience_id: args.audience_id };
}
