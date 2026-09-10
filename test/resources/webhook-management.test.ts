import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function client() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ content: [], totalPages: 1, number: 0 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('webhookEndpoints', () => {
  it('uses the /api/v1/partner prefix for every operation', async () => {
    const { chari, calls } = client();
    await chari.webhookEndpoints.create({ url: 'https://shop.example.com/webhooks' } as never);
    await chari.webhookEndpoints.list();
    await chari.webhookEndpoints.retrieve('we_1');
    await chari.webhookEndpoints.update('we_1', { active: false } as never);
    await chari.webhookEndpoints.activate('we_1');
    await chari.webhookEndpoints.rotateSecret('we_1');
    await chari.webhookEndpoints.sendTestEvent('we_1');
    await chari.webhookEndpoints.del('we_1');

    for (const call of calls) expect(call.url).toContain('/api/v1/partner/webhooks/endpoints');
    expect(calls[3]!.init.method).toBe('PATCH');
    expect(calls[4]!.url).toContain('/we_1/activate');
    expect(calls[5]!.url).toContain('/we_1/rotate-secret');
    expect(calls[6]!.url).toContain('/we_1/test');
    expect(calls[7]!.init.method).toBe('DELETE');
  });
});

describe('webhookEvents', () => {
  it('lists deliveries, retrieves one, and lists types', async () => {
    const { chari, calls } = client();
    await chari.webhookEvents.list({ size: 5 });
    await chari.webhookEvents.retrieve('dl_1');
    await chari.webhookEvents.listTypes();

    expect(calls[0]!.url).toContain('/api/v1/partner/webhooks/events?');
    expect(calls[1]!.url).toContain('/api/v1/partner/webhooks/events/dl_1');
    expect(calls[2]!.url).toContain('/api/v1/partner/webhooks/event-types');
  });
});
