import type { TenantContext } from '../tenant-context.js';
import { rateLimitedCall } from '../utils/rate-limiter.js';
import { graphGet } from '../utils/graph.js';

export const catalogTools = [
  {
    name: 'meta_list_product_catalogs',
    description: 'List product catalogs linked to the ad account. Returns catalog ID, name, vertical, and product count. Required before creating Dynamic Product Ads (DPA) — you need a catalog_id and product_set_id for the promoted_object.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'meta_get_catalog',
    description: 'Get details for a specific product catalog including product count, feed count, and vertical. Use to verify you have the right catalog before listing products.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        catalog_id: { type: 'string', description: 'Catalog ID (from meta_list_product_catalogs)' },
      },
      required: ['catalog_id'],
    },
  },
  {
    name: 'meta_list_catalog_products',
    description: 'Browse products in a catalog. Returns product ID, name, price, availability, and image URL. Use to verify products are syncing correctly or to audit catalog health before running Dynamic Product Ads.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        catalog_id: { type: 'string', description: 'Catalog ID to browse' },
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default 25)' },
        after: { type: 'string', description: 'Pagination cursor from a previous response' },
        filter: {
          type: 'string',
          enum: ['all', 'with_errors'],
          description: '"with_errors" shows only items with data issues. (default: all)',
        },
      },
      required: ['catalog_id'],
    },
  },
  {
    name: 'meta_list_product_sets',
    description: 'List product sets (filtered subsets) in a catalog. Product sets are used as promoted_object.product_set_id when creating Dynamic Product Ad sets — they define which products to show (e.g. "shoes under $100", "all in-stock items").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        catalog_id: { type: 'string', description: 'Catalog ID (from meta_list_product_catalogs)' },
        limit: { type: 'number', minimum: 1, maximum: 50, description: 'Max results (default 25)' },
      },
      required: ['catalog_id'],
    },
  },
];

export async function handleCatalogTool(ctx: TenantContext, name: string, args: any): Promise<any> {
  switch (name) {
    case 'meta_list_product_catalogs': return listProductCatalogs(ctx, args);
    case 'meta_get_catalog': return getCatalog(ctx, args);
    case 'meta_list_catalog_products': return listCatalogProducts(ctx, args);
    case 'meta_list_product_sets': return listProductSets(ctx, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function listProductCatalogs(ctx: TenantContext, args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${ctx.adAccountId}/product_catalogs`, {
      fields: 'id,name,product_count,vertical,feed_count',
      limit: args.limit ?? 10,
    }),
  );

  return {
    catalogs: (result.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      vertical: c.vertical ?? null,
      product_count: c.product_count ?? 0,
      feed_count: c.feed_count ?? 0,
    })),
    note: 'Use catalog_id with meta_list_product_sets to find product_set_id values for Dynamic Product Ad targeting.',
  };
}

async function getCatalog(ctx: TenantContext, args: any): Promise<any> {
  const c = await rateLimitedCall(() =>
    graphGet(ctx, args.catalog_id, {
      fields: 'id,name,product_count,vertical,feed_count,owner_business',
    }),
  );
  return {
    id: c.id,
    name: c.name,
    vertical: c.vertical ?? null,
    product_count: c.product_count ?? 0,
    feed_count: c.feed_count ?? 0,
    owner_business: c.owner_business?.name ?? null,
  };
}

async function listCatalogProducts(ctx: TenantContext, args: any): Promise<any> {
  const params: Record<string, any> = {
    fields: 'id,retailer_id,name,price,sale_price,currency,availability,image_url,url,brand,category,errors',
    limit: args.limit ?? 25,
  };
  if (args.after) params.after = args.after;
  if (args.filter === 'with_errors') params.filter = JSON.stringify({ has_errors: { eq: true } });

  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${args.catalog_id}/products`, params),
  );

  const products = (result.data ?? []).map((p: any) => ({
    id: p.id,
    retailer_id: p.retailer_id ?? null,
    name: p.name,
    price: p.price ?? null,
    sale_price: p.sale_price ?? null,
    currency: p.currency ?? null,
    availability: p.availability ?? null,
    image_url: p.image_url ?? null,
    url: p.url ?? null,
    brand: p.brand ?? null,
    errors: p.errors?.length ? p.errors : null,
  }));

  return {
    catalog_id: args.catalog_id,
    products,
    total_returned: products.length,
    ...(result.paging?.cursors?.after && result.paging?.next
      ? { next_cursor: result.paging.cursors.after }
      : {}),
  };
}

async function listProductSets(ctx: TenantContext, args: any): Promise<any> {
  const result = await rateLimitedCall(() =>
    graphGet(ctx, `${args.catalog_id}/product_sets`, {
      fields: 'id,name,filter,product_count',
      limit: args.limit ?? 25,
    }),
  );

  return {
    catalog_id: args.catalog_id,
    product_sets: (result.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      product_count: s.product_count ?? null,
      filter_summary: s.filter ? JSON.stringify(s.filter) : 'all products',
    })),
    note: 'Use the id as promoted_object.product_set_id in meta_deploy_campaign for Dynamic Product Ads.',
  };
}
