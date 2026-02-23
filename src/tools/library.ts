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

// ── Tool definitions ──

export const libraryTools = [
  {
    name: 'meta_search_ads_library',
    description: `Search the Meta Ads Library for active ads from any advertiser — including competitors. Returns ad creative text, page name, estimated impressions/spend, and a snapshot URL to view the ad. Use for competitive research, creative inspiration, or to audit a brand's current ad activity.

Tip: search by page_id (from meta_list_pages) for your own account, or by search_terms to find competitor ads. At least one of search_terms or search_page_ids is required.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        search_terms: {
          type: 'string',
          description: 'Keyword to search ad copy and page names (e.g. "fitness app", "free trial")',
        },
        search_page_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Facebook Page IDs to filter ads by specific advertisers',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO 2-letter country codes to filter by ad reach (default: ["US"])',
        },
        ad_type: {
          type: 'string',
          enum: ['ALL', 'POLITICAL_AND_ISSUE_ADS'],
          description: 'Type of ads to search (default: ALL)',
        },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 20)' },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
      },
    },
  },
  {
    name: 'meta_list_ad_images',
    description: 'Browse the ad image library for the account. Returns image hash, name, dimensions, URL, and status. Use to find existing image hashes to reuse in new ads (via meta_add_ad or meta_deploy_campaign) without re-uploading.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default 25)' },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
      },
    },
  },
  {
    name: 'meta_list_ad_videos',
    description: 'Browse the ad video library for the account. Returns video ID, title, length, status, and thumbnail. Use to find existing video IDs to reuse in new video ads without re-uploading.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default 25)' },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
      },
    },
  },
];

// ── Handler ──

export async function handleLibraryTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_search_ads_library': return searchAdsLibrary(args);
    case 'meta_list_ad_images': return listAdImages(args);
    case 'meta_list_ad_videos': return listAdVideos(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──

async function searchAdsLibrary(args: any): Promise<any> {
  if (!args.search_terms && !args.search_page_ids?.length) {
    return { success: false, error: 'Provide at least one of: search_terms or search_page_ids.' };
  }

  const countries = args.countries ?? ['US'];
  const params: Record<string, any> = {
    ad_type: args.ad_type ?? 'ALL',
    ad_reached_countries: JSON.stringify(countries),
    fields: 'id,ad_creative_body,ad_creative_link_titles,ad_creative_link_captions,page_name,page_id,ad_delivery_start_time,ad_snapshot_url,impressions,spend,currency',
    limit: args.limit ?? 20,
  };

  if (args.search_terms) params.search_terms = args.search_terms;
  if (args.search_page_ids?.length) params.search_page_ids = JSON.stringify(args.search_page_ids);
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() => graphGet('ads_archive', params));

  const ads = (result.data ?? []).map((ad: any) => ({
    id: ad.id,
    page: ad.page_name ?? null,
    page_id: ad.page_id ?? null,
    body: ad.ad_creative_body ?? null,
    title: ad.ad_creative_link_titles?.[0] ?? null,
    caption: ad.ad_creative_link_captions?.[0] ?? null,
    started: ad.ad_delivery_start_time ?? null,
    impressions: ad.impressions
      ? `${Number(ad.impressions.lower_bound).toLocaleString()}–${Number(ad.impressions.upper_bound).toLocaleString()}`
      : null,
    spend: ad.spend
      ? `${ad.currency ?? ''} ${Number(ad.spend.lower_bound).toLocaleString()}–${Number(ad.spend.upper_bound).toLocaleString()}`
      : null,
    snapshot_url: ad.ad_snapshot_url ?? null,
  }));

  return {
    ads,
    total_returned: ads.length,
    countries,
    ...(result.paging?.cursors?.after && result.paging?.next
      ? { next_cursor: result.paging.cursors.after }
      : {}),
  };
}

async function listAdImages(args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'hash,name,url,width,height,status,created_time',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() =>
    graphGet(`${config.adAccountId}/adimages`, params),
  );

  const images = (result.data ?? []).map((img: any) => ({
    hash: img.hash,
    name: img.name ?? null,
    url: img.url ?? null,
    dimensions: img.width && img.height ? `${img.width}×${img.height}` : null,
    status: img.status ?? null,
    created: img.created_time ?? null,
  }));

  return {
    images,
    total_returned: images.length,
    ...(result.paging?.cursors?.after && result.paging?.next
      ? { next_cursor: result.paging.cursors.after }
      : {}),
    note: 'Use the hash field when creating ads with meta_add_ad or meta_deploy_campaign.',
  };
}

async function listAdVideos(args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'id,title,description,length,status,created_time,picture',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() =>
    graphGet(`${config.adAccountId}/advideos`, params),
  );

  const videos = (result.data ?? []).map((v: any) => ({
    id: v.id,
    title: v.title ?? null,
    description: v.description ?? null,
    length_seconds: v.length ?? null,
    status: v.status ?? null,
    thumbnail_url: v.picture ?? null,
    created: v.created_time ?? null,
  }));

  return {
    videos,
    total_returned: videos.length,
    ...(result.paging?.cursors?.after && result.paging?.next
      ? { next_cursor: result.paging.cursors.after }
      : {}),
    note: 'Use the id field when creating video ads with meta_deploy_campaign.',
  };
}
