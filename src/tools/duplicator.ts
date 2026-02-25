import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet, graphPost } from '../utils/graph.js';

// ── Tool definitions ──

export const duplicatorTools = [
  {
    name: 'meta_duplicate_adset',
    description: `Deep-copy a single ad set (with its ads) into the same campaign or a different campaign. All copied entities are created in PAUSED status by default. Use when you want to test the same ad set structure in multiple campaigns, or clone an ad set with minor changes.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string', description: 'ID of the ad set to duplicate' },
        target_campaign_id: { type: 'string', description: 'Campaign to copy the ad set into (default: same campaign)' },
        new_name: { type: 'string', description: 'Name for the new ad set (default: original name + " Copy")' },
        deep_copy: { type: 'boolean', description: 'Copy ads inside the ad set as well (default: true)' },
        status: {
          type: 'string',
          enum: ['PAUSED', 'ACTIVE', 'INHERITED_FROM_SOURCE'],
          description: 'Status for the new ad set (default: PAUSED)',
        },
      },
      required: ['adset_id'],
    },
  },
  {
    name: 'meta_duplicate_creative',
    description: `Clone an ad creative and optionally override the body text, headline, call-to-action type, or destination URL. Returns the new creative ID. Use when you want to A/B test copy variations without recreating the entire creative from scratch.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        creative_id: { type: 'string', description: 'ID of the creative to clone' },
        new_name: { type: 'string', description: 'Name for the new creative' },
        body_override: { type: 'string', description: 'Replace the primary text (body copy)' },
        headline_override: { type: 'string', description: 'Replace the headline' },
        cta_type_override: {
          type: 'string',
          enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_OFFER', 'GET_QUOTE', 'SUBSCRIBE', 'APPLY_NOW'],
          description: 'Replace the CTA button type',
        },
        url_override: { type: 'string', description: 'Replace destination URL in all link placements' },
      },
      required: ['creative_id'],
    },
  },
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
    case 'meta_duplicate_adset': return duplicateAdSet(args);
    case 'meta_duplicate_creative': return duplicateCreative(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Helpers ──

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

/** Poll an async Graph API session until completed or failed (~20 min max with exponential backoff). */
async function pollAsyncSession(sessionId: string, maxAttempts = 50): Promise<string> {
  const BASE_MS = 5_000;
  const MAX_MS = 30_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_MS * Math.pow(2, attempt - 1), MAX_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const session = await rateLimitedCall(() =>
      graphGet(sessionId, {
        fields: 'id,status,result,results,error_message,error_code,error_subcode,error_user_title,error_user_msg',
      }),
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
      // Surface v25 error fields for actionable diagnostics
      const userMsg = session.error_user_msg ?? session.error_user_title ?? session.error_message ?? JSON.stringify(session);
      const code = session.error_code ? ` (code ${session.error_code})` : '';
      const subcode = session.error_subcode ? ` (subcode ${session.error_subcode})` : '';
      throw new Error(`Async copy session ${sessionId} failed: ${userMsg}${code}${subcode}`);
    }
    // in_progress / pending — keep polling
  }

  throw new Error(`Async copy session ${sessionId} did not complete within ~20 minutes. The campaign may still be copying on Meta's side — check Ads Manager.`);
}

// ── Implementation ──

async function duplicateAdSet(args: any): Promise<any> {
  const { adset_id, target_campaign_id, new_name, deep_copy = true, status = 'PAUSED' } = args;

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: Duplicate ad set ${adset_id}${target_campaign_id ? ` into campaign ${target_campaign_id}` : ''}`,
    };
  }

  const bodyParams: Record<string, string> = {
    deep_copy: deep_copy ? '1' : '0',
    status_option: status === 'INHERITED_FROM_SOURCE' ? 'INHERITED_FROM_SOURCE' : status,
    rename_strategy: 'DEEP_RENAME',
  };
  if (new_name) bodyParams.name = new_name;
  if (target_campaign_id) bodyParams.campaign_id = target_campaign_id;

  const batchItem = {
    method: 'POST',
    relative_url: `${adset_id}/copies`,
    body: new URLSearchParams(bodyParams).toString(),
  };

  const sessionId = await rateLimitedCall(async () => {
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

  // Poll for completion — the session result contains the new adset id in results[0].body
  const newAdSetId = await pollAsyncSessionForAdSet(sessionId);

  return {
    success: true,
    new_adset_id: newAdSetId,
    target_campaign_id: target_campaign_id ?? '(same as source)',
    status: status === 'INHERITED_FROM_SOURCE' ? 'INHERITED_FROM_SOURCE' : status,
  };
}

/** Like pollAsyncSession but extracts copied_adset_id from the result. */
async function pollAsyncSessionForAdSet(sessionId: string, maxAttempts = 50): Promise<string> {
  const BASE_MS = 5_000;
  const MAX_MS = 30_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_MS * Math.pow(2, attempt - 1), MAX_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const session = await rateLimitedCall(() =>
      graphGet(sessionId, {
        fields: 'id,status,result,results,error_message,error_code,error_subcode,error_user_title,error_user_msg',
      }),
    );
    const status = (session.status ?? '').toLowerCase();

    if (status === 'completed') {
      // Try direct fields first
      const directId: string =
        session.copied_adset_id ??
        session.result?.copied_adset_id;
      if (directId) return directId;

      // Try batch results array
      const batchResults: any[] = session.results ?? (Array.isArray(session.result) ? session.result : []);
      if (batchResults.length > 0) {
        try {
          const body = typeof batchResults[0].body === 'string'
            ? JSON.parse(batchResults[0].body)
            : (batchResults[0].body ?? {});
          const adsetId: string = body.copied_adset_id ?? body.id;
          if (adsetId) return adsetId;
        } catch { /* fall through */ }
      }

      throw new Error(`Async session ${sessionId} completed but no copied_adset_id found. Raw: ${JSON.stringify(session)}`);
    }

    if (status === 'failed' || status === 'error') {
      const userMsg = session.error_user_msg ?? session.error_user_title ?? session.error_message ?? JSON.stringify(session);
      const code = session.error_code ? ` (code ${session.error_code})` : '';
      const subcode = session.error_subcode ? ` (subcode ${session.error_subcode})` : '';
      throw new Error(`Async copy session ${sessionId} failed: ${userMsg}${code}${subcode}`);
    }
  }

  throw new Error(`Async copy session ${sessionId} did not complete within ~20 minutes.`);
}

async function duplicateCreative(args: any): Promise<any> {
  const { creative_id, new_name, body_override, headline_override, cta_type_override, url_override } = args;

  if (config.dryRun) {
    return {
      dry_run: true,
      message: `Simulated: Duplicate creative ${creative_id}`,
    };
  }

  // Step 1: Fetch existing creative
  const qp = new URLSearchParams({
    access_token: config.accessToken,
    fields: 'id,name,object_story_spec,asset_feed_spec',
  });
  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${creative_id}?${qp.toString()}`);
  const creative = await response.json() as any;
  if (!response.ok || creative.error) {
    const e = creative.error ?? {};
    throw new Error(e.message ?? `HTTP ${response.status}`);
  }

  if (!creative.object_story_spec) {
    throw new Error('Creative does not have an object_story_spec — cannot clone this type of creative.');
  }

  // Step 2: Deep-clone and apply overrides
  const spec = JSON.parse(JSON.stringify(creative.object_story_spec));

  const applyToLinkData = (ld: any) => {
    if (!ld) return;
    if (body_override) ld.message = body_override;
    if (headline_override) ld.name = headline_override;
    if (url_override) ld.link = url_override;
    if (cta_type_override && ld.call_to_action) ld.call_to_action.type = cta_type_override;
    if (url_override && ld.child_attachments) {
      for (const card of ld.child_attachments) {
        if (card.link) card.link = url_override;
      }
    }
  };

  applyToLinkData(spec.link_data);

  if (spec.video_data) {
    if (body_override) spec.video_data.message = body_override;
    if (url_override && spec.video_data.call_to_action?.value) {
      spec.video_data.call_to_action.value.link = url_override;
    }
    if (cta_type_override && spec.video_data.call_to_action) {
      spec.video_data.call_to_action.type = cta_type_override;
    }
  }

  // Step 3: Create new creative
  const creativeParams: Record<string, any> = {
    name: new_name ?? `${creative.name} Copy`,
    object_story_spec: spec,
  };

  const newCreative = await rateLimitedCall(() =>
    graphPost(`${config.adAccountId}/adcreatives`, creativeParams),
  );

  return {
    success: true,
    new_creative_id: newCreative.id,
    new_name: creativeParams.name,
    account_id: config.adAccountId,
  };
}

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
