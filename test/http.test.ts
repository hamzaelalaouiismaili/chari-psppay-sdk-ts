import { describe, expect, it, vi } from 'vitest';
import { ChariPayAuthenticationError, ChariPayConnectionError } from '../src/errors.js';
import { HttpClient, redactBody, type ResolvedConfig } from '../src/http.js';

/** A fetch mock that never settles on its own — only when `init.signal` aborts. */
function hangingFetch() {
  return vi.fn((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });
}

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

  describe('body redaction (onRequest must never see PAN/CVV)', () => {
    it('redacts a CheckoutSubmitRequest-shaped body before onRequest sees it, without mutating the caller object', async () => {
      const { fetchMock } = stub([{ status: 200, body: {} }]);
      const onRequest = vi.fn();
      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { onRequest }));

      const body = {
        sessionId: 'sess_1',
        card: {
          firstName: 'Amina',
          lastName: 'B.',
          pan: '4111111111111111',
          expiryDate: '12/29',
          cvv: '123',
        },
      };
      const snapshot = JSON.parse(JSON.stringify(body));

      await http.request({ method: 'POST', path: '/checkout/submit', body, isPublic: true });

      expect(body).toEqual(snapshot); // never mutated

      const emitted = onRequest.mock.calls[0]![0].body as typeof body;
      const emittedText = JSON.stringify(emitted);
      expect(emittedText).not.toContain('4111111111111111');
      expect(emittedText).not.toContain('"cvv":"123"');
      expect(emitted.sessionId).toBe('sess_1');
      expect(emitted.card.firstName).toBe('Amina');
      expect(emitted.card.lastName).toBe('B.');
      expect(emitted.card.pan).toBe('***redacted***');
      expect(emitted.card.cvv).toBe('***redacted***');
      expect(emitted.card.expiryDate).toBe('***redacted***');
    });

    it('redactBody redacts nested objects and arrays case-insensitively, without mutating the input', () => {
      const input = {
        amount: 100,
        card: { PAN: '4111', number: '5555', Cvv: '999', cvc: '111', securityCode: '222', expiry: '01/30' },
        clientSecret: 'sk_live_abc',
        apiKey: 'key_abc',
        api_key: 'key_abc',
        password: 'hunter2',
        accessToken: 'tok_abc',
        cards: [{ pan: '4222', label: 'ok' }],
        nested: { deeper: { cardNumber: '6011' } },
        description: 'Order #1234',
      };
      const snapshot = JSON.parse(JSON.stringify(input));

      const out = redactBody(input) as Record<string, unknown>;

      expect(input).toEqual(snapshot); // not mutated
      expect(out.amount).toBe(100);
      expect(out.description).toBe('Order #1234');
      const card = out.card as Record<string, unknown>;
      expect(card.PAN).toBe('***redacted***');
      expect(card.number).toBe('***redacted***');
      expect(card.Cvv).toBe('***redacted***');
      expect(card.cvc).toBe('***redacted***');
      expect(card.securityCode).toBe('***redacted***');
      expect(card.expiry).toBe('***redacted***');
      expect(out.clientSecret).toBe('***redacted***');
      expect(out.apiKey).toBe('***redacted***');
      expect(out.api_key).toBe('***redacted***');
      expect(out.password).toBe('***redacted***');
      expect(out.accessToken).toBe('***redacted***');
      expect(((out.cards as Array<Record<string, unknown>>)[0] as Record<string, unknown>).pan).toBe('***redacted***');
      expect(((out.cards as Array<Record<string, unknown>>)[0] as Record<string, unknown>).label).toBe('ok');
      expect(((out.nested as Record<string, unknown>).deeper as Record<string, unknown>).cardNumber).toBe(
        '***redacted***',
      );
    });
  });

  describe('timeout and abort', () => {
    it('rejects a request that exceeds `timeout` as a ChariPayConnectionError mentioning the timeout', async () => {
      const fetchMock = hangingFetch();
      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { timeout: 20 }));

      const err = await http.request({ method: 'GET', path: '/v1/wallet' }).catch((e) => e);
      expect(err).toBeInstanceOf(ChariPayConnectionError);
      expect((err as Error).message).toMatch(/timed out after 20ms/);
    });

    it('a caller-supplied signal aborts an in-flight request, and the message says so (not "timed out")', async () => {
      const fetchMock = hangingFetch();
      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { timeout: 5000 }));
      const controller = new AbortController();

      const promise = http.request({
        method: 'GET',
        path: '/v1/wallet',
        options: { signal: controller.signal },
      });
      queueMicrotask(() => controller.abort());

      const err = await promise.catch((e) => e);
      expect(err).toBeInstanceOf(ChariPayConnectionError);
      expect((err as Error).message).toMatch(/aborted by the caller/);
      expect((err as Error).message).not.toMatch(/timed out/);
    });

    it('rejects immediately, without calling fetch, when the caller signal is already aborted', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('fetch must not be called for a pre-aborted signal');
      });
      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { timeout: 5000 }));
      const controller = new AbortController();
      controller.abort();

      const err = await http
        .request({ method: 'GET', path: '/v1/wallet', options: { signal: controller.signal } })
        .catch((e) => e);

      expect(err).toBeInstanceOf(ChariPayConnectionError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a caller abort on a retryable request rejects promptly instead of consuming the retry budget', async () => {
      const fetchMock = hangingFetch();
      // Default maxRetries (no override), so a bug that treats the abort as
      // a retryable connection failure would retry twice with backoff
      // before rejecting.
      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { timeout: 5000, maxRetries: 2 }));
      const controller = new AbortController();

      const promise = http.request({
        method: 'GET',
        path: '/v1/wallet',
        options: { signal: controller.signal },
      });
      queueMicrotask(() => controller.abort());

      const err = await promise.catch((e) => e);
      expect(err).toBeInstanceOf(ChariPayConnectionError);
      expect((err as Error).message).toMatch(/aborted by the caller/);
      // The robust proof that no retry was attempted: fetch was invoked exactly once.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a timed-out idempotent POST that is retried replays the SAME Idempotency-Key', async () => {
      const keys: Array<string | undefined> = [];
      let calls = 0;
      const fetchMock = vi.fn((_url: string, init: RequestInit) => {
        keys.push((init.headers as Record<string, string>)['Idempotency-Key']);
        calls += 1;
        if (calls === 1) {
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
        );
      });

      const http = new HttpClient(config(fetchMock as unknown as typeof fetch, { timeout: 20, maxRetries: 1 }));
      const out = await http.request<{ ok: boolean }>({
        method: 'POST',
        path: '/v1/payment-links',
        body: {},
        autoIdempotency: true,
      });

      expect(out).toEqual({ ok: true });
      expect(calls).toBe(2);
      expect(keys[0]).toBeDefined();
      expect(keys[0]).toBe(keys[1]);
    });
  });
});
