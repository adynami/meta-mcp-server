import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

export const conversionsTools = [
  {
    name: 'meta_send_conversions_event',
    description: `Send a server-side conversion event to Meta via the Conversions API (CAPI). Use to supplement or replace browser-based pixel events — critical for iOS 14+ where signal is lost due to ATT opt-outs. All PII (email, phone, name) is SHA-256 hashed before sending.

IMPORTANT — always confirm with the user before calling:
1. Which pixel? (pixel_id from meta_list_pixels)
2. What event? (Purchase, Lead, ViewContent, etc.)
3. What user signals are available? (email, phone — more = better match rate)
4. Is there a matching browser pixel event to deduplicate? (use same event_id in both)

This is a write operation — confirm all details before calling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        pixel_id: { type: 'string', description: 'Meta Pixel ID (from meta_list_pixels)' },
        event_name: {
          type: 'string',
          enum: ['Purchase', 'Lead', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompleteRegistration', 'Search', 'Subscribe', 'Contact', 'Donate', 'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Other'],
          description: 'Standard Meta event name. Use "Other" + custom_event_name for non-standard events.',
        },
        custom_event_name: {
          type: 'string',
          description: 'Required when event_name is "Other". Your custom event identifier (e.g. "BookingCompleted").',
        },
        event_time: {
          type: 'number',
          description: 'Unix timestamp (seconds) when the event occurred. Defaults to now if omitted.',
        },
        event_source_url: {
          type: 'string',
          description: 'URL where the event occurred (e.g. "https://example.com/checkout/thank-you").',
        },
        action_source: {
          type: 'string',
          enum: ['website', 'app', 'crm', 'chat', 'email', 'phone_call', 'physical_store', 'system_generated', 'other'],
          description: 'Where the conversion happened (default: website)',
        },
        event_id: {
          type: 'string',
          description: 'Unique event ID for deduplication with browser pixel. Use the same ID in both server and browser events to prevent double-counting.',
        },
        user_data: {
          type: 'object',
          description: 'User signals for matching. More signals = better match rate. All PII is hashed before sending.',
          properties: {
            email: { type: 'string', description: 'User email (plaintext — SHA-256 hashed before sending)' },
            phone: { type: 'string', description: 'Phone number (plaintext — normalized + SHA-256 hashed)' },
            first_name: { type: 'string', description: 'First name (plaintext — lowercased + hashed)' },
            last_name: { type: 'string', description: 'Last name (plaintext — lowercased + hashed)' },
            city: { type: 'string', description: 'City (plaintext — lowercased + hashed)' },
            state: { type: 'string', description: '2-letter state code — lowercased + hashed' },
            zip: { type: 'string', description: 'Postal code — hashed' },
            country: { type: 'string', description: '2-letter ISO country code — lowercased + hashed' },
            external_id: { type: 'string', description: 'Your internal customer/user ID — hashed' },
            client_ip_address: { type: 'string', description: 'IPv4 or IPv6 — sent as-is (not hashed)' },
            client_user_agent: { type: 'string', description: 'Browser user agent string — sent as-is' },
            fbc: { type: 'string', description: 'Facebook click ID from _fbc cookie — sent as-is' },
            fbp: { type: 'string', description: 'Facebook browser ID from _fbp cookie — sent as-is' },
          },
        },
        custom_data: {
          type: 'object',
          description: 'Event-specific data. For Purchase: include value + currency. For ViewContent/AddToCart: include content_ids.',
          properties: {
            value: { type: 'number', description: 'Monetary value (e.g. 59.99 for $59.99)' },
            currency: { type: 'string', description: '3-letter ISO currency code (e.g. "USD"). Required when value is set.' },
            content_ids: { type: 'array', items: { type: 'string' }, description: 'Product IDs from your catalog' },
            content_type: { type: 'string', enum: ['product', 'product_group'], description: 'Type of content_ids' },
            content_name: { type: 'string', description: 'Name of the product or page' },
            num_items: { type: 'number', description: 'Number of items in the order' },
            order_id: { type: 'string', description: 'Order/transaction ID' },
            predicted_ltv: { type: 'number', description: 'Predicted lifetime value of this customer' },
            search_string: { type: 'string', description: 'Search query (for Search events)' },
          },
        },
        test_event_code: {
          type: 'string',
          description: 'Test event code from Meta Events Manager. Use to validate events without affecting real data.',
        },
      },
      required: ['pixel_id', 'event_name'],
    },
  },
];

export async function handleConversionsTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_send_conversions_event': return sendConversionsEvent(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildUserData(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (raw.email) out.em = sha256(raw.email.toLowerCase().trim());
  if (raw.phone) out.ph = sha256(raw.phone.replace(/\D/g, ''));
  if (raw.first_name) out.fn = sha256(raw.first_name.toLowerCase().trim());
  if (raw.last_name) out.ln = sha256(raw.last_name.toLowerCase().trim());
  if (raw.city) out.ct = sha256(raw.city.toLowerCase().trim());
  if (raw.state) out.st = sha256(raw.state.toLowerCase().trim());
  if (raw.zip) out.zp = sha256(raw.zip.trim());
  if (raw.country) out.country = sha256(raw.country.toLowerCase().trim());
  if (raw.external_id) out.external_id = sha256(raw.external_id.trim());
  // Unhashed fields
  if (raw.client_ip_address) out.client_ip_address = raw.client_ip_address;
  if (raw.client_user_agent) out.client_user_agent = raw.client_user_agent;
  if (raw.fbc) out.fbc = raw.fbc;
  if (raw.fbp) out.fbp = raw.fbp;
  return out;
}

async function sendConversionsEvent(args: any): Promise<any> {
  const eventName = args.event_name === 'Other' && args.custom_event_name
    ? args.custom_event_name
    : args.event_name;

  const eventTime = args.event_time ?? Math.floor(Date.now() / 1000);
  const userData = args.user_data ? buildUserData(args.user_data) : {};

  const event: Record<string, any> = {
    event_name: eventName,
    event_time: eventTime,
    action_source: args.action_source ?? 'website',
    user_data: userData,
  };

  if (args.event_source_url) event.event_source_url = args.event_source_url;
  if (args.event_id) event.event_id = args.event_id;

  if (args.custom_data) {
    const cd: Record<string, any> = {};
    if (args.custom_data.value != null) cd.value = String(args.custom_data.value);
    if (args.custom_data.currency) cd.currency = args.custom_data.currency.toUpperCase();
    if (args.custom_data.content_ids?.length) cd.content_ids = args.custom_data.content_ids;
    if (args.custom_data.content_type) cd.content_type = args.custom_data.content_type;
    if (args.custom_data.content_name) cd.content_name = args.custom_data.content_name;
    if (args.custom_data.num_items != null) cd.num_items = args.custom_data.num_items;
    if (args.custom_data.order_id) cd.order_id = args.custom_data.order_id;
    if (args.custom_data.predicted_ltv != null) cd.predicted_ltv = String(args.custom_data.predicted_ltv);
    if (args.custom_data.search_string) cd.search_string = args.custom_data.search_string;
    if (Object.keys(cd).length) event.custom_data = cd;
  }

  const signalsSent = Object.keys(userData);

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: send ${eventName} to pixel ${args.pixel_id}`,
      event_time_iso: new Date(eventTime * 1000).toISOString(),
      user_signals: signalsSent,
      custom_data: event.custom_data ?? null,
    };
  }

  const body: Record<string, any> = {
    data: [event],
    access_token: config.accessToken,
  };
  if (args.test_event_code) body.test_event_code = args.test_event_code;

  const result = await rateLimitedCall(async () => {
    const url = `https://graph.facebook.com/${config.apiVersion}/${args.pixel_id}/events`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as any;
    if (!response.ok || data.error) {
      const e = data.error ?? {};
      const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
      err.response = { error: e };
      throw err;
    }
    return data;
  });

  return {
    success: true,
    events_received: result.events_received ?? 1,
    event_name: eventName,
    pixel_id: args.pixel_id,
    event_time_iso: new Date(eventTime * 1000).toISOString(),
    fbtrace_id: result.fbtrace_id ?? null,
    user_signals_sent: signalsSent,
    ...(result.messages?.length && { warnings: result.messages }),
    ...(args.test_event_code && { test_mode: true }),
    note: args.event_id
      ? 'Deduplication active — browser pixel events with the same event_id will be deduplicated.'
      : 'Tip: set event_id to the same value on your browser pixel event to enable deduplication.',
  };
}
