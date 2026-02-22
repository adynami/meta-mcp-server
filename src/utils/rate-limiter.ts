interface RateLimitState {
  callSleepMs: number;
  lastHeaders: Record<string, string>;
}

const state: RateLimitState = {
  callSleepMs: 0,
  lastHeaders: {},
};

function parseUsageHeaders(headers: Record<string, string>): void {
  const usage = headers['x-business-use-case-usage'];
  if (!usage) return;

  try {
    const parsed = JSON.parse(usage);
    for (const accountId of Object.keys(parsed)) {
      for (const entry of parsed[accountId]) {
        const pct = Math.max(
          entry.call_count ?? 0,
          entry.total_cputime ?? 0,
          entry.total_time ?? 0,
        );
        if (pct > 90) {
          state.callSleepMs = 60_000; // back off 60s when near limit
        } else if (pct > 75) {
          state.callSleepMs = 10_000; // back off 10s when getting warm
        } else {
          state.callSleepMs = 0;
        }
      }
    }
  } catch {
    // ignore parse failures
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rateLimitedCall<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (state.callSleepMs > 0) {
      await sleep(state.callSleepMs);
    }

    try {
      const result = await fn();
      // The FB SDK doesn't expose raw headers easily, so we reset on success
      state.callSleepMs = Math.max(0, state.callSleepMs - 5000);
      return result;
    } catch (err: any) {
      // Check headers on the error response if available (SDK errors)
      if (err?.headers) parseUsageHeaders(err.headers);
      if (err?.response?.headers) parseUsageHeaders(err.response.headers);

      // Meta API rate limit error codes — check both SDK shape and direct fetch shape
      const errCode =
        err?.error?.code ??           // FB SDK
        err?.response?.error?.code;   // direct fetch (duplicator, etc.)

      const isRateLimit = err?.status === 429 || errCode === 4 || errCode === 17 || errCode === 32 || errCode === 613;

      if (isRateLimit) {
        const waitMs = Math.min(60_000, 5_000 * Math.pow(2, attempt));
        state.callSleepMs = waitMs;
        if (attempt < maxRetries) {
          await sleep(waitMs);
          continue;
        }
      }

      throw err;
    }
  }

  throw new Error('Rate limit: max retries exceeded');
}
