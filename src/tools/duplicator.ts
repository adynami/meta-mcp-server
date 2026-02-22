import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

// ── Tool definitions ──

export const duplicatorTools = [
  {
    name: 'meta_duplicate_campaign',
    description: 'Duplicate an existing campaign with a deep copy (clones all ad sets and ads), assign a new funnel URL to each ad set, and set a daily budget per ad set. All copied entities are created in PAUSED status. Use when the user wants to clone a proven campaign structure with different landing pages or budgets. Requires exactly 3 funnel URLs — one per ad set.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'ID of the campaign to duplicate (numeric string, e.g. "23851234567890")',
        },
        new_campaign_name: {
          type: 'string',
          description: 'Display name for the new duplicated campaign',
        },
        funnel_urls: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
          description: 'Exactly 3 destination URLs — matched to ad sets by index (ad set 0 → funnel_urls[0], etc.)',
        },
        daily_budget_per_adset: {
          type: 'number',
          minimum: 1,
          description: 'Daily budget in cents per ad set (e.g. 3300 = $33/day)',
        },
      },
      required: ['campaign_id', 'new_campaign_name', 'funnel_urls', 'daily_budget_per_adset'],
    },
  },
];

// ── Handler ──

export async function handleDuplicatorTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_duplicate_campaign': return duplicateCampaign(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Helpers ──

async function graphPost(objectPath: string, params: Record<string, any>): Promise<any> {
  const url = `https://graph.facebook.com/v25.0/${objectPath}`;
  const formBody = new URLSearchParams();
  formBody.append('access_token', config.accessToken);
  for (const [key, value] of Object.entries(params)) {
    formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  console.error('[meta-mcp] graphPost body:', formBody.toString());
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

async function graphGet(objectPath: string, params: Record<string, any> = {}): Promise<any> {
  const url = new URL(`https://graph.facebook.com/v25.0/${objectPath}`);
  url.searchParams.append('access_token', config.accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const response = await fetch(url.toString());
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

// ── Implementation ──


/** Poll an async Graph API session until completed or failed (max ~5 min). */
async function pollAsyncSession(sessionId: string, maxAttempts = 100): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Request all fields that might carry the result
    const session = await rateLimitedCall(() =>
      graphGet(sessionId, { fields: 'id,status,result,results,error_message' }),
    );
    const status = (session.status ?? '').toLowerCase();

    if (status === 'completed') {
      // Direct async /copies response: copied_campaign_id at top level
      const directId: string =
        session.copied_campaign_id ??
        session.result?.copied_campaign_id ??
        session.data?.copied_campaign_id;
      if (directId) return directId;

      // Async batch response: results is an array of per-request responses
      const batchResults: any[] = session.results ?? (Array.isArray(session.result) ? session.result : []);
      if (batchResults.length > 0) {
        try {
          const body = typeof batchResults[0].body === 'string'
            ? JSON.parse(batchResults[0].body)
            : (batchResults[0].body ?? {});
          const campaignId: string = body.copied_campaign_id;
          if (campaignId) return campaignId;
        } catch { /* body parse failed — fall through to error below */ }
      }

      throw new Error(
        `Async session ${sessionId} completed but no copied_campaign_id found. Raw: ${JSON.stringify(session)}`,
      );
    }

    if (status === 'failed' || status === 'error') {
      const detail = session.error_message ?? session.result?.error_message ?? JSON.stringify(session);
      throw new Error(`Async copy session ${sessionId} failed: ${detail}`);
    }

    // Still in_progress / pending — loop back
  }

  throw new Error(`Async copy session ${sessionId} did not complete within ${maxAttempts * 3} seconds`);
}

async function duplicateCampaign(args: any): Promise<any> {
  const { campaign_id, new_campaign_name, funnel_urls, daily_budget_per_adset } = args;

  if (!Array.isArray(funnel_urls) || funnel_urls.length !== 3) {
    throw new Error(`funnel_urls must contain exactly 3 URLs, got ${funnel_urls?.length ?? 0}`);
  }

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: Duplicate campaign ${campaign_id} as "${new_campaign_name}"`,
      new_campaign_name,
      funnel_urls,
      daily_budget_per_adset,
    };
  }

  // Step 1: Submit via the Graph API Asynchronous Batch Requests endpoint.
  // The /copies endpoint has no async parameter — async mode requires wrapping
  // the request in a batch with async=1 at the outer level.
  const sessionId = await rateLimitedCall(async () => {
    const batchItem = {
      method: 'POST',
      relative_url: `${campaign_id}/copies`,
      body: new URLSearchParams({
        deep_copy: '1',
        status_option: 'PAUSED',
        rename_strategy: 'DEEP_RENAME',
        name: new_campaign_name,
      }).toString(),
    };

    const formBody = new URLSearchParams();
    formBody.append('access_token', config.accessToken);
    formBody.append('async', '1');
    formBody.append('batch', JSON.stringify([batchItem]));

    console.error('[meta-mcp] async batch body:', formBody.toString());

    const response = await fetch('https://graph.facebook.com/v25.0/', {
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

    console.error('[meta-mcp] async batch response:', JSON.stringify(data));

    const sid: string = data.async_session_id;
    if (!sid) {
      throw new Error(`Async batch missing async_session_id. Raw: ${JSON.stringify(data)}`);
    }
    return sid;
  });

  const newCampaignId = await pollAsyncSession(sessionId);

  // Step 2: Fetch the ad sets in the new campaign
  const adSetsResponse = await rateLimitedCall(() =>
    graphGet(`${newCampaignId}/adsets`, { fields: 'id,name,status', limit: 10 }),
  );

  const adSets: any[] = adSetsResponse.data ?? [];
  if (adSets.length !== 3) {
    console.error(`[meta-mcp] duplicate_campaign: expected 3 ad sets, found ${adSets.length} in new campaign ${newCampaignId}`);
  }

  // Step 3: For each ad set — set budget and swap funnel URL in each ad's creative
  const adsetSummaries: Array<{
    adset_id: string;
    adset_name: string;
    assigned_funnel_url: string;
    status: string;
  }> = [];

  for (let i = 0; i < adSets.length; i++) {
    const adSet = adSets[i];
    const funnelUrl = funnel_urls[i];

    // Update the daily budget on the ad set
    await rateLimitedCall(() =>
      graphPost(adSet.id, { daily_budget: String(daily_budget_per_adset) }),
    );

    // Fetch ads in this ad set with their creative specs
    const adsResponse = await rateLimitedCall(() =>
      graphGet(`${adSet.id}/ads`, {
        fields: 'id,name,creative{id,object_story_spec}',
        limit: 10,
      }),
    );
    const ads: any[] = adsResponse.data ?? [];

    for (const ad of ads) {
      const creative = ad.creative;
      if (!creative?.object_story_spec) continue;

      // Deep clone the spec and update link_data.link
      const updatedSpec = JSON.parse(JSON.stringify(creative.object_story_spec));
      if (updatedSpec.link_data) {
        updatedSpec.link_data.link = funnelUrl;
      }

      // Meta creatives are immutable — create a new one with the updated URL
      const newCreative = await rateLimitedCall(() =>
        graphPost(`${config.adAccountId}/adcreatives`, {
          object_story_spec: updatedSpec,
        }),
      );

      // Point the ad at the new creative
      await rateLimitedCall(() =>
        graphPost(ad.id, {
          creative: { creative_id: newCreative.id },
        }),
      );
    }

    adsetSummaries.push({
      adset_id: adSet.id,
      adset_name: adSet.name,
      assigned_funnel_url: funnelUrl,
      status: 'PAUSED',
    });
  }

  return {
    success: true,
    new_campaign_id: newCampaignId,
    new_campaign_name,
    adsets: adsetSummaries,
    all_statuses_paused: true,
  };
}
