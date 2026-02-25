import type { TenantContext } from '../tenant-context.js';
import { rateLimitedCall } from './rate-limiter.js';

export interface BatchOperation {
  method: 'GET' | 'POST' | 'DELETE';
  relative_url: string;
  body?: string;
  name?: string;
  depends_on?: string;
}

/**
 * Execute up to 50 Graph API operations in a single HTTP request.
 * Each item in the returned array corresponds to the matching input operation.
 * Items with API errors return { error, code } rather than throwing.
 */
export async function graphBatch(ctx: TenantContext, operations: BatchOperation[]): Promise<any[]> {
  if (operations.length === 0) return [];
  if (operations.length > 50) {
    throw new Error('Batch API supports a maximum of 50 operations per request');
  }

  return rateLimitedCall(async () => {
    const formBody = new URLSearchParams();
    formBody.append('access_token', ctx.accessToken);
    formBody.append('batch', JSON.stringify(operations));

    const response = await fetch(`https://graph.facebook.com/${ctx.apiVersion}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Batch request failed with HTTP ${response.status}: ${text}`);
    }

    const results = await response.json() as Array<{ code: number; body: string } | null>;

    return results.map((result, i) => {
      if (result === null) return null;
      try {
        const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
        if (result.code >= 400 || body?.error) {
          const e = body?.error ?? {};
          const err = new Error(e.message ?? `HTTP ${result.code}`) as any;
          err.response = { error: e };
          err.batchIndex = i;
          return { error: err, code: result.code };
        }
        return body;
      } catch {
        return { raw: result.body, code: result.code };
      }
    });
  });
}

/**
 * Split a large list of operations into chunks and execute each chunk as a batch.
 * Useful when you have > 50 operations — it fires batches sequentially.
 */
export async function graphBatchAll(ctx: TenantContext, operations: BatchOperation[]): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < operations.length; i += 50) {
    const chunk = operations.slice(i, i + 50);
    const chunkResults = await graphBatch(ctx, chunk);
    results.push(...chunkResults);
  }
  return results;
}
