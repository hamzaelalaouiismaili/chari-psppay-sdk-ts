import { describe, expect, it, vi } from 'vitest';
import { ChariPayAuthenticationError, ChariPayConnectionError } from '../src/errors.js';
import { HttpClient, type ResolvedConfig } from '../src/http.js';

function stub(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
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
    maxRetries: 0,
    debug: false,
    fetch: fetchMock,
    ...over,
  };
}

describe('HttpClient', () => {
  it('sends the API key and returns the parsed body', async () => {
    const { fetchMock, calls } = stub([{ status: 200, body: { balance: 12 } }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    const out = await http.request<{ balance: number }>({ method: 'GET', path: '/v1/wallet' });

    expect(out.balance).toBe(12);
    expect(calls[0]!.url).toBe('https://api.example.test/v1/wallet');
    expect((calls[0]!.init.headers as Record<string, string>)['X-CHARI-PAY-API-KEY'])
      .toBe('chari_sk_test_EXAMPLE');
  });

  it('omits the API key on public checkout operations', async () => {
    const { fetchMock, calls } = stub([{ status: 200, body: { ok: true } }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await http.request({ method: 'POST', path: '/checkout/verify', body: { sessionId: 's' }, isPublic: true });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-CHARI-PAY-API-KEY']).toBeUndefined();
  });

  it('serialises query parameters and drops undefined ones', async () => {
    const { fetchMock, calls } = stub([{ status: 200, body: {} }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await http.request({ method: 'GET', path: '/v1/transactions', query: { status: 'SUCCESS', page: 0, cursor: undefined } });

    expect(calls[0]!.url).toBe('https://api.example.test/v1/transactions?status=SUCCESS&page=0');
  });

  it('sends an Idempotency-Key when the caller supplies one', async () => {
    const { fetchMock, calls } = stub([{ status: 200, body: {} }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await http.request({ method: 'POST', path: '/v1/refunds', body: {}, options: { idempotencyKey: 'key_1' } });

    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe('key_1');
  });

  it('generates an Idempotency-Key for auto-idempotent creates', async () => {
    const { fetchMock, calls } = stub([{ status: 200, body: {} }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await http.request({ method: 'POST', path: '/v1/payment-links', body: {}, autoIdempotency: true });

    const key = (calls[0]!.init.headers as Record<string, string>)['Idempotency-Key'];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws a typed error carrying the correlation id', async () => {
    const { fetchMock } = stub([
      { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'bad key' }, correlationId: 'c_9' } },
    ]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    const err = (await http.request({ method: 'GET', path: '/v1/wallet' }).catch((e) => e)) as { correlationId?: string };
    expect(err).toBeInstanceOf(ChariPayAuthenticationError);
    expect(err.correlationId).toBe('c_9');
  });

  it('wraps a network failure as a connection error', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await expect(http.request({ method: 'GET', path: '/v1/wallet' }))
      .rejects.toBeInstanceOf(ChariPayConnectionError);
  });

  it('returns undefined for a 204', async () => {
    const { fetchMock } = stub([{ status: 204 }]);
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch));

    await expect(http.request({ method: 'DELETE', path: '/v1/clients/1' })).resolves.toBeUndefined();
  });

  it('invokes the observability hooks', async () => {
    const { fetchMock } = stub([{ status: 200, body: {} }]);
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { onRequest, onResponse }));

    await http.request({ method: 'GET', path: '/v1/wallet' });

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onResponse.mock.calls[0]![0]).toMatchObject({ status: 200 });
  });
});
