import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

// ── Tool definitions ──

export const duplicatorTools = [
  {
    name: 'meta_duplicate_campaign',
    description: 'Deep-copy a campaign (clones all ad sets and ads). All copied entities are created in PAUSED status. Optionally swap funnel URLs and set a new budget per ad set. Use when cloning a proven campaign structure with different landing pages, budgets, or for A/B testing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaign_id: {
          type: 'string',
          description: 'ID of the campaign to duplicate',
        },
        new_campaign_name: {
          type: 'string',
          description: 'Display name for the new campaign',
        },
        funnel_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'New destination URLs to assign to ad sets by index. Optional — omit to keep original URLs. If fewer URLs than ad sets, the last URL is reused for remaining ad sets. Provide one per ad set for full control.',
        },
        daily_budget_per_adset: {
          type: 'number',
          minimum: 1,
          description: 'New daily budget per ad set in major currency units (e.g. 33 for $33/day). Optional — omit to keep original ad set budgets.',
        },
      },
      required: ['campaign_id', 'new_campaign_name'],
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
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}`;
  const formBody = new URLSearchParams();
  formBody.append('access_token', config.accessToken);
  for (const [key, value] of Object.entries(params)) {
    formBody.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
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

async function graphGet(objectPath: string, params: Record<string, any> = {}): Promise<any> {
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${objectPath}`);
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

/** Fetch all ad sets for a campaign, auto-paginating. */
async function fetchAllAdSets(campaignId: string): Promise<any[]> {
  const adSets: any[] = [];
  let cursor: string | null = null;

  do {
    const params: Record<string, any> = { fields: 'id,name,status', limit: 25 };
    if (cursor) params.after = cursor;

    const resp = await rateLimitedCall(() => graphGet(`${campaignId}/adsets`, params));
    adSets.push(...(resp.data ?? []));
    cursor = resp.paging?.cursors?.after && resp.paging?.next ? resp.paging.cursors.after : null;
  } while (cursor);

  return adSets;
}

/** Poll an async Graph API session until completed or failed (max ~5 min). */
async function pollAsyncSession(sessionId: string, maxAttempts = 100): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const session = await rateLimitedCall(() =>
      graphGet(sessionId, { fields: 'id,status,result,results,error_message' }),
    );
    const status = (session.status ?? '').toLowerCase();

    if (status === 'completed') {
      const directId: string =
        session.copied_campaign_id ??
        session.result?.copied_campaign_id ??
        session.data?.copied_campaign_id;
      if (directId) return directId;

      const batchResults: any[] = session.results ?? (Array.isArray(session.result) ? session.result : []);
      if (batchResults.length > 0) {
        try {
          const body = typeof batchResults[0].body === 'string'
            ? JSON.parse(batchResults[0].body)
            : (batchResults[0].body ?? {});
          const campaignId: string = body.copied_campaign_id;
          if (campaignId) return campaignId;
        } catch { /* fall through */ }
      }

      throw new Error(
        `Async session ${sessionId} completed but no copied_campaign_id found. Raw: ${JSON.stringify(session)}`,
      );
    }

    if (status === 'failed' || status === 'error') {
      const detail = session.error_message ?? session.result?.error_message ?? JSON.stringify(session);
      throw new Error(`Async copy session ${sessionId} failed: ${detail}`);
    }
    // in_progress / pending — keep polling
  }

  throw new Error(`Async copy session ${sessionId} did not complete within ${maxAttempts * 3} seconds`);
}

// ── Implementation ──

async function duplicateCampaign(args: any): Promise<any> {
  const { campaign_id, new_campaign_name, funnel_urls, daily_budget_per_adset } = args;

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: Duplicate campaign ${campaign_id} as "${new_campaign_name}"`,
      new_campaign_name,
      funnel_urls: funnel_urls ?? '(keep originals)',
      daily_budget_per_adset: daily_budget_per_adset ?? '(keep originals)',
    };
  }

  // Step 1: Async deep copy via Graph API batch
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

    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/`, {
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

    const sid: string = data.async_session_id;
    if (!sid) throw new Error(`Async batch missing async_session_id. Raw: ${JSON.stringify(data)}`);
    return sid;
  });

  const newCampaignId = await pollAsyncSession(sessionId);

  // Step 2: Fetch all ad sets in the new campaign (auto-paginated)
  const adSets = await fetchAllAdSets(newCampaignId);

  if (adSets.length === 0) {
    return {
      success: true,
      new_campaign_id: newCampaignId,
      new_campaign_name,
      adsets: [],
      note: 'Campaign copied but no ad sets found in the new campaign.',
    };
  }

  // Step 3: For each ad set — optionally update budget and swap funnel URLs
  const adsetSummaries: Array<{
    adset_id: string;
    adset_name: string;
    funnel_url: string | null;
    budget_updated: boolean;
    status: string;
  }> = [];

  for (let i = 0; i < adSets.length; i++) {
    const adSet = adSets[i];

    // Determine funnel URL for this ad set
    // If funnel_urls has fewer entries than ad sets, reuse the last one
    let funnelUrl: string | null = null;
    if (funnel_urls?.length) {
      funnelUrl = funnel_urls[Math.min(i, funnel_urls.length - 1)];
    }

    // Update budget if requested
    if (daily_budget_per_adset != null) {
      const budgetCents = Math.round(daily_budget_per_adset * 100);
      await rateLimitedCall(() => graphPost(adSet.id, { daily_budget: String(budgetCents) }));
    }

    // Swap funnel URLs if provided
    if (funnelUrl) {
      const adsResponse = await rateLimitedCall(() =>
        graphGet(`${adSet.id}/ads`, { fields: 'id,name,creative{id,object_story_spec}', limit: 50 }),
      );
      const ads: any[] = adsResponse.data ?? [];

      for (const ad of ads) {
        const creative = ad.creative;
        if (!creative?.object_story_spec) continue;

        const updatedSpec = JSON.parse(JSON.stringify(creative.object_story_spec));

        // Handle image, carousel, and video link_data
        if (updatedSpec.link_data?.link) {
          updatedSpec.link_data.link = funnelUrl;
        }
        if (updatedSpec.link_data?.child_attachments) {
          for (const card of updatedSpec.link_data.child_attachments) {
            if (card.link) card.link = funnelUrl;
          }
        }
        // Handle video CTA link
        if (updatedSpec.video_data?.call_to_action?.value?.link) {
          updatedSpec.video_data.call_to_action.value.link = funnelUrl;
        }

        // Creatives are immutable — create a new one, then point the ad to it
        const newCreative = await rateLimitedCall(() =>
          graphPost(`${config.adAccountId}/adcreatives`, { object_story_spec: updatedSpec }),
        );

        await rateLimitedCall(() =>
          graphPost(ad.id, { creative: { creative_id: newCreative.id } }),
        );
      }
    }

    adsetSummaries.push({
      adset_id: adSet.id,
      adset_name: adSet.name,
      funnel_url: funnelUrl,
      budget_updated: daily_budget_per_adset != null,
      status: 'PAUSED',
    });
  }

  return {
    success: true,
    new_campaign_id: newCampaignId,
    new_campaign_name,
    adsets_count: adSets.length,
    adsets: adsetSummaries,
    all_statuses_paused: true,
  };
}
