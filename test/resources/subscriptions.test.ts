import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function client(body: unknown = { content: [], totalPages: 1, number: 0 }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('subscriptions', () => {
  it('creates and reads', async () => {
    const { chari, calls } = client();
    await chari.subscriptions.create({ amount: 99, frequency: 'MONTHLY' } as never);
    await chari.subscriptions.list({ size: 2 });
    await chari.subscriptions.retrieve('sub_1');
    await chari.subscriptions.charges('sub_1');

    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[1]!.url).toContain('/v1/subscriptions?');
    expect(calls[2]!.url).toContain('/v1/subscriptions/sub_1');
    expect(calls[3]!.url).toContain('/v1/subscriptions/sub_1/charges');
  });

  it('runs every lifecycle verb', async () => {
    const { chari, calls } = client({});
    await chari.subscriptions.pause('sub_1');
    await chari.subscriptions.resume('sub_1');
    await chari.subscriptions.cancel('sub_1');
    await chari.subscriptions.selectPaymentMethod('sub_1', { paymentMethodId: 'pm_1' } as never);
    await chari.subscriptions.testAutoPay('sub_1');

    expect(calls[0]!.url).toContain('/v1/subscriptions/sub_1/pause');
    expect(calls[1]!.url).toContain('/v1/subscriptions/sub_1/resume');
    expect(calls[2]!.url).toContain('/v1/subscriptions/sub_1/cancel');
    expect(calls[3]!.url).toContain('/v1/subscriptions/sub_1/payment-method');
    expect(calls[3]!.init.method).toBe('PUT');
    expect(calls[4]!.url).toContain('/v1/subscriptions/sub_1/test-auto-pay');
  });
});
