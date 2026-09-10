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

const keyOf = (init: RequestInit) => (init.headers as Record<string, string>)['X-CHARI-PAY-API-KEY'];

describe('checkoutSessions (authenticated)', () => {
  it('creates a session with the API key', async () => {
    const { chari, calls } = client({ sessionId: 'cs_1', vk: 'vk_1' });

    const session = await chari.checkoutSessions.create({ amount: 250 } as never);

    expect(session.sessionId).toBe('cs_1');
    expect(calls[0]!.url).toContain('/v1/payment-sessions');
    expect(keyOf(calls[0]!.init)).toBe('chari_sk_test_EXAMPLE');
  });

  it('lists, retrieves and cancels', async () => {
    const { chari, calls } = client({ content: [], totalPages: 1, number: 0 });
    await chari.checkoutSessions.list({ size: 3 });
    await chari.checkoutSessions.retrieve('cs_1');
    await chari.checkoutSessions.cancel('cs_1');

    expect(calls[0]!.url).toContain('/v1/payment-sessions?');
    expect(calls[1]!.url).toContain('/v1/payment-sessions/cs_1');
    expect(calls[2]!.url).toContain('/v1/payment-sessions/cs_1/cancel');
  });
});

describe('checkout (public — MUST NOT send the API key)', () => {
  it('verify sends no API key', async () => {
    const { chari, calls } = client({ amount: 250, currency: 'MAD' });
    await chari.checkout.verify({ sessionId: 'cs_1', vk: 'vk_1' } as never);
    expect(calls[0]!.url).toContain('/checkout/verify');
    expect(keyOf(calls[0]!.init)).toBeUndefined();
  });

  it('submit sends no API key and always carries an Idempotency-Key', async () => {
    const { chari, calls } = client({ status: 'SUCCESS' });
    await chari.checkout.submit({ sessionId: 'cs_1', card: { number: '4111111111111111' } } as never);
    expect(calls[0]!.url).toContain('/checkout/submit');
    expect(keyOf(calls[0]!.init)).toBeUndefined();
    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it('confirmReturn sends no API key', async () => {
    const { chari, calls } = client({ status: 'SUCCESS' });
    await chari.checkout.confirmReturn({ sessionId: 'cs_1' } as never);
    expect(calls[0]!.url).toContain('/checkout/return');
    expect(keyOf(calls[0]!.init)).toBeUndefined();
  });

  it('paymentStatus sends no API key', async () => {
    const { chari, calls } = client({ status: 'SUCCESS' });
    await chari.checkout.paymentStatus('pay_1');
    expect(calls[0]!.url).toContain('/checkout/payments/pay_1');
    expect(keyOf(calls[0]!.init)).toBeUndefined();
  });
});
