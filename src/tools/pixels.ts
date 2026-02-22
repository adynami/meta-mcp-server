import { listPixels, getPixelStats } from '../meta-client.js';
import { resolveRange, type TimeRangeKey } from '../utils/date-ranges.js';

export const pixelTools = [
  {
    name: 'meta_list_pixels',
    description: 'List Meta Pixels associated with the ad account. Returns pixel ID, name, last-fired time, and availability status. Use when the user needs to find a pixel ID, check if tracking is set up, or verify a pixel is firing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 25, description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'meta_get_pixel_events',
    description: `Get event counts fired by a Meta Pixel, broken down by event name. Use when the user asks "is my pixel working?", wants to see what conversion events are being tracked, or needs to debug why conversions aren't showing in Ads Manager. Returns events sorted by volume.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        pixel_id: { type: 'string', description: 'Pixel ID (from meta_list_pixels)' },
        time_range: {
          type: 'string',
          enum: ['last_3d', 'last_7d', 'last_14d', 'last_30d'],
          description: 'Time window to analyse (default: last_7d)',
        },
      },
      required: ['pixel_id'],
    },
  },
];

export async function handlePixelTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_pixels': return handleListPixels(args);
    case 'meta_get_pixel_events': return handleGetPixelEvents(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleListPixels(args: any): Promise<any> {
  const pixels = await listPixels(args.limit ?? 10);
  return {
    pixels: pixels.map((p: any) => ({
      id: p.id,
      name: p.name,
      last_fired: p.last_fired_time ?? 'never',
      created: p.creation_time,
      unavailable: p.is_unavailable ?? false,
    })),
  };
}

async function handleGetPixelEvents(args: any): Promise<any> {
  const rangeKey = (args.time_range ?? 'last_7d') as TimeRangeKey;
  const range = resolveRange(rangeKey);

  // Pixel stats API uses Unix timestamps
  const startUnix = Math.floor(new Date(range.since + 'T00:00:00Z').getTime() / 1000);
  const endUnix = Math.floor(new Date(range.until + 'T23:59:59Z').getTime() / 1000);

  const data = await getPixelStats(args.pixel_id, {
    start_time: String(startUnix),
    end_time: String(endUnix),
    aggregation: 'event_name',
  });

  const events: any[] = (data.data ?? []).sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0));

  if (!events.length) {
    return {
      pixel_id: args.pixel_id,
      period: `${range.since} to ${range.until}`,
      note: 'No events recorded in this period. Verify the pixel is installed on the website and firing correctly.',
      events: [],
    };
  }

  return {
    pixel_id: args.pixel_id,
    period: `${range.since} to ${range.until}`,
    events: events.map((e: any) => ({
      event: e.event_name ?? e.type,
      count: e.count,
    })),
  };
}
