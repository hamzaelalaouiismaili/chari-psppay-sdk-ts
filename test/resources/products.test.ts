import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function client(body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('products', () => {
  it('covers the full lifecycle', async () => {
    const { chari, calls } = client({ content: [], totalPages: 1, number: 0 });
    await chari.products.create({ name: 'Coffee', price: 25 } as never);
    await chari.products.list({ size: 2 });
    await chari.products.retrieve('pr_1');
    await chari.products.update('pr_1', { price: 30 } as never);
    await chari.products.deactivate('pr_1');
    await chari.products.orders('pr_1', { size: 5 });

    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[1]!.url).toContain('/v1/products?');
    expect(calls[2]!.url).toContain('/v1/products/pr_1');
    expect(calls[3]!.init.method).toBe('PATCH');
    expect(calls[4]!.init.method).toBe('DELETE');
    expect(calls[5]!.url).toContain('/v1/products/pr_1/orders?');
  });
});
