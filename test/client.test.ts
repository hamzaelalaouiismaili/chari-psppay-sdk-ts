import { describe, expect, it, vi } from 'vitest';
import { ChariPay, PRODUCTION_BASE_URL, SANDBOX_BASE_URL, resolveBaseUrl } from '../src/index.js';

describe('ChariPay configuration', () => {
  it('accepts a bare API key', () => {
    const chari = new ChariPay('chari_sk_test_EXAMPLE');
    expect(chari.wallet).toBeDefined();
  });

  it('infers sandbox from a test key', () => {
    expect(resolveBaseUrl('chari_sk_test_EXAMPLE')).toBe(SANDBOX_BASE_URL);
  });

  it('infers production from any other key', () => {
    expect(resolveBaseUrl('chari_sk_live_EXAMPLE')).toBe(PRODUCTION_BASE_URL);
  });

  it('lets an explicit baseUrl win', async () => {
    const fetchMock = vi.fn(async (_input?: string | URL | Request, _init?: RequestInit) =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const chari = new ChariPay({
      apiKey: 'chari_sk_test_EXAMPLE',
      baseUrl: 'http://localhost:9999',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await chari.wallet.balance();

    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://localhost:9999/v1/wallet');
  });

  it('rejects a missing API key with an actionable message', () => {
    // @ts-expect-error deliberately wrong
    expect(() => new ChariPay({})).toThrow(/apiKey/);
  });

  it('defaults timeout and retries', () => {
    const chari = new ChariPay('chari_sk_test_EXAMPLE');
    expect(chari.config.timeout).toBe(30000);
    expect(chari.config.maxRetries).toBe(2);
  });
});
