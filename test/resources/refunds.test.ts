import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

describe('refunds', () => {
  it('creates a partial refund idempotently, lists and retrieves', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ content: [], totalPages: 1, number: 0 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });

    await chari.refunds.create({ reference: 'tx_1', amount: 20 } as never);
    await chari.refunds.list({ size: 2 });
    await chari.refunds.retrieve('rf_1');

    expect(calls[0]!.url).toContain('/v1/refunds');
    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(calls[1]!.url).toContain('/v1/refunds?');
    expect(calls[2]!.url).toContain('/v1/refunds/rf_1');
  });
});
