import type { TenantContext } from '../tenant-context.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet } from '../utils/graph.js';

// ── Tool definitions ──

export const libraryTools = [
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

export async function handleLibraryTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_ad_images': return listAdImages(ctx, args);
    case 'meta_list_ad_videos': return listAdVideos(ctx, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Implementations ──

async function listAdImages(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'hash,name,url,width,height,status,created_time',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/adimages`, params),
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

async function listAdVideos(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'id,title,description,length,status,created_time,picture',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;

  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/advideos`, params),
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
