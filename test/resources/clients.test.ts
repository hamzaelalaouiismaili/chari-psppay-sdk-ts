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

describe('clients', () => {
  it('creates', async () => {
    const { chari, calls } = client({ id: 'cl_1' });
    await chari.clients.create({ name: 'Amine Bennani', email: 'buyer@example.com' } as never);
    expect(calls[0]!.url).toContain('/v1/clients');
    expect(calls[0]!.init.method).toBe('POST');
  });

  it('lists, retrieves, updates and deletes', async () => {
    const { chari, calls } = client({ content: [], totalPages: 1, number: 0 });
    await chari.clients.list({ size: 2 });
    await chari.clients.retrieve('cl_1');
    await chari.clients.update('cl_1', { name: 'New' } as never);
    await chari.clients.del('cl_1');

    expect(calls[0]!.url).toContain('/v1/clients?');
    expect(calls[1]!.url).toContain('/v1/clients/cl_1');
    expect(calls[2]!.init.method).toBe('PUT');
    expect(calls[3]!.init.method).toBe('DELETE');
  });

  it('manages payment methods', async () => {
    const { chari, calls } = client([]);
    await chari.clients.listPaymentMethods('cl_1');
    await chari.clients.setDefaultPaymentMethod('cl_1', 'pm_9');
    await chari.clients.deletePaymentMethod('cl_1', 'pm_9');

    expect(calls[0]!.url).toContain('/v1/clients/cl_1/payment-methods');
    expect(calls[1]!.url).toContain('/v1/clients/cl_1/payment-methods/pm_9/default');
    expect(calls[1]!.init.method).toBe('POST');
    expect(calls[2]!.url).toContain('/v1/clients/cl_1/payment-methods/pm_9');
    expect(calls[2]!.init.method).toBe('DELETE');
  });
});
