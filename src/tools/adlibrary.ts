import { config } from '../config.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';

// ── Tool definition ──────────────────────────────────────────────────────────

export const adLibraryTools = [
  {
    name: 'meta_search_ad_library',
    description: `Search the Meta Ad Library for competitor or market ads. Returns ad copy, headlines, formats, estimated run duration, and platform placements — ready to paste into meta_generate_creative_brief (signal_type: from_competitor).

The Ad Library is public data. Use it to map competitor messaging, identify dominant hooks, find format gaps, and discover how long ads have been running (run duration is a strong proxy for spend/performance — ads that run 30+ days are almost always profitable).

No additional permissions required — uses your existing access token.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        search_terms: {
          type: 'string',
          description: 'Brand name, product name, or keyword to search. Use a brand name for competitor analysis (e.g. "Athletic Greens", "Notion", "Shopify").',
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO country codes to filter by (e.g. ["US", "GB", "AU"]). Default: ["US"].',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Max ads to return (default: 20). Use 5–10 for a quick read; 30–50 for a thorough competitive audit.',
        },
        active_only: {
          type: 'boolean',
          description: 'If true, return only currently active ads (default: false — returns both active and recently stopped).',
        },
        search_page_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific Facebook Page IDs. Use when you know the exact page (more precise than search_terms for known brands).',
        },
      },
      required: ['search_terms'],
    },
  },
];

// ── Ad Library API fields ─────────────────────────────────────────────────────

const AD_LIBRARY_FIELDS = [
  'id',
  'page_name',
  'page_id',
  'ad_creation_time',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_creative_link_captions',
  'publisher_platforms',
  'languages',
  'estimated_audience_size',
  'impressions',
  'spend',
].join(',');

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleAdLibraryTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_search_ad_library': return searchAdLibrary(args);
    default: throw new Error(`Unknown ad library tool: ${name}`);
  }
}

async function searchAdLibrary(args: any): Promise<any> {
  const countries = args.countries ?? ['US'];
  const limit = args.limit ?? 20;

  return rateLimitedCall(async () => {
    const qp = new URLSearchParams({
      access_token: config.accessToken,
      search_terms: args.search_terms,
      ad_reached_countries: JSON.stringify(countries),
      ad_type: 'ALL',
      fields: AD_LIBRARY_FIELDS,
      limit: String(limit),
    });

    if (args.active_only) {
      qp.append('ad_active_status', 'ACTIVE');
    }

    if (args.search_page_ids?.length) {
      qp.append('search_page_ids', JSON.stringify(args.search_page_ids));
    }

    const url = `https://graph.facebook.com/${config.apiVersion}/ads_archive?${qp.toString()}`;
    const response = await fetch(url);
    const data = await response.json() as any;

    if (!response.ok || data.error) {
      const e = data.error ?? {};
      // Surface a helpful message for the most common Ad Library auth issue
      if (e.code === 10 || e.code === 200) {
        throw new Error(`Ad Library access denied. Ensure your access token has the "ads_read" permission and that your app has been granted Ad Library API access. Error: ${e.message}`);
      }
      throw new Error(e.message ?? `HTTP ${response.status}`);
    }

    const ads = (data.data ?? []).map((ad: any) => normaliseAd(ad));

    return {
      search_terms: args.search_terms,
      countries,
      total_returned: ads.length,
      ads,
      next_step: 'Pass this output to meta_generate_creative_brief with signal_type: "from_competitor" to extract the differentiation opportunity.',
      audit_tip: 'Ads running 30+ days are almost always profitable — study their hook, format, and copy angle carefully.',
    };
  });
}

// ── Normaliser ────────────────────────────────────────────────────────────────

function normaliseAd(ad: any): Record<string, any> {
  const startDate = ad.ad_delivery_start_time ?? ad.ad_creation_time;
  const stopDate = ad.ad_delivery_stop_time ?? null;

  // Run duration: days from start to stop (or today if still running)
  let run_days: number | null = null;
  let is_active = false;
  if (startDate) {
    const start = new Date(startDate).getTime();
    const end = stopDate ? new Date(stopDate).getTime() : Date.now();
    run_days = Math.round((end - start) / (1000 * 60 * 60 * 24));
    is_active = !stopDate;
  }

  // Flatten creative arrays — Meta returns arrays to cover multi-creative ads
  const body = (ad.ad_creative_bodies ?? [])[0] ?? null;
  const headline = (ad.ad_creative_link_titles ?? [])[0] ?? null;
  const description = (ad.ad_creative_link_descriptions ?? [])[0] ?? null;
  const caption = (ad.ad_creative_link_captions ?? [])[0] ?? null;

  // Spend/impression ranges
  const spend = ad.spend ? { lower: ad.spend.lower_bound, upper: ad.spend.upper_bound, currency: ad.spend.currency } : null;
  const impressions = ad.impressions ? { lower: ad.impressions.lower_bound, upper: ad.impressions.upper_bound } : null;

  return {
    id: ad.id,
    page_name: ad.page_name ?? null,
    page_id: ad.page_id ?? null,
    is_active,
    run_days,
    start_date: startDate ?? null,
    stop_date: stopDate,
    copy: {
      body,
      headline,
      description,
      caption,
    },
    platforms: ad.publisher_platforms ?? [],
    languages: ad.languages ?? [],
    estimated_audience_size: ad.estimated_audience_size ?? null,
    spend_estimate: spend,
    impression_estimate: impressions,
    performance_signal: run_days !== null
      ? run_days >= 30 ? 'long_runner_likely_profitable'
        : run_days >= 14 ? 'medium_run_testing'
        : 'short_run_or_new'
      : null,
  };
}
