import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChariPayAPIError, ChariPayRateLimitError } from '../src/errors.js';
import { HttpClient, backoffMs, isRetryable, type ResolvedConfig } from '../src/http.js';

function sequence(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    });
  });
  return { fetchMock, calls };
}

function config(fetchMock: typeof fetch, over: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'chari_sk_test_EXAMPLE',
    baseUrl: 'https://api.example.test',
    timeout: 5000,
    maxRetries: 2,
    debug: false,
    fetch: fetchMock,
    ...over,
  };
}

/** Runs a promise to completion while fast-forwarding every backoff sleep. */
async function withFakeTimers<T>(run: () => Promise<T>): Promise<T> {
  const promise = run();
  // Pre-attach a no-op handler so Node's unhandled-rejection tracker doesn't
  // flag `promise` during the timer flush below, before the caller's own
  // `.rejects` assertion has a chance to attach its handler. The original
  // promise is still returned and still rejects with the same error.
  promise.catch(() => {});
  await vi.runAllTimersAsync();
  return promise;
}

describe('retry policy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries a 500 on a GET and succeeds', async () => {
    const { fetchMock, calls } = sequence([
      { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } },
      { status: 200, body: { balance: 7 } },
    ]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    const out = await withFakeTimers(() => http.request<{ balance: number }>({ method: 'GET', path: '/v1/wallet' }));

    expect(out.balance).toBe(7);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const { fetchMock, calls } = sequence([{ status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { maxRetries: 2 }));

    await expect(withFakeTimers(() => http.request({ method: 'GET', path: '/v1/wallet' })))
      .rejects.toBeInstanceOf(ChariPayAPIError);
    expect(calls).toHaveLength(3); // 1 attempt + 2 retries
  });

  it('does NOT retry a POST that carries no idempotency key', async () => {
    const { fetchMock, calls } = sequence([{ status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await expect(withFakeTimers(() => http.request({ method: 'POST', path: '/v1/wallet/cash-ins', body: {} })))
      .rejects.toBeInstanceOf(ChariPayAPIError);
    expect(calls).toHaveLength(1);
  });

  it('retries an idempotent POST reusing the SAME key', async () => {
    const { fetchMock, calls } = sequence([
      { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } },
      { status: 200, body: { reference: 'pl_1' } },
    ]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await withFakeTimers(() =>
      http.request({ method: 'POST', path: '/v1/payment-links', body: {}, autoIdempotency: true }),
    );

    expect(calls).toHaveLength(2);
    const first = (calls[0]!.init.headers as Record<string, string>)['Idempotency-Key'];
    const second = (calls[1]!.init.headers as Record<string, string>)['Idempotency-Key'];
    expect(first).toBeTruthy();
    expect(second).toBe(first); // a fresh key on retry would double-charge
  });

  it('does not retry a 4xx that is not 429', async () => {
    const { fetchMock, calls } = sequence([
      { status: 422, body: { error: { code: 'WALLET_NOT_ACTIVE', message: 'nope' } } },
    ]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await expect(withFakeTimers(() => http.request({ method: 'GET', path: '/v1/wallet' }))).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it('retries a 429 and surfaces retryAfter when it finally fails', async () => {
    const { fetchMock, calls } = sequence([
      { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'slow down' } }, headers: { 'retry-after': '1' } },
    ]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { maxRetries: 1 }));

    const err = await withFakeTimers(() =>
      http.request({ method: 'GET', path: '/v1/wallet' }).catch((e) => e),
    );

    expect(err).toBeInstanceOf(ChariPayRateLimitError);
    expect((err as ChariPayRateLimitError).retryAfter).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('honours Retry-After over computed backoff', () => {
    expect(backoffMs(1, 3)).toBe(3000);
  });

  it('grows exponentially and stays within the cap', () => {
    for (let attempt = 1; attempt <= 8; attempt++) {
      const ms = backoffMs(attempt);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(8000);
    }
  });

  it('classifies retryable statuses', () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(422)).toBe(false);
    expect(isRetryable(404)).toBe(false);
  });
});
