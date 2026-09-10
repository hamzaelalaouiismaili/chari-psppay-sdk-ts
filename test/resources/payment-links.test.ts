import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function client(body: unknown = {}, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const binary = headers['content-type'] && !headers['content-type'].includes('json');
    return new Response(binary ? new Uint8Array([1, 2, 3]) : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', ...headers },
    });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('paymentLinks', () => {
  it('creates a link with an idempotency key', async () => {
    const { chari, calls } = client({ reference: 'pl_1', url: 'https://pay.chari.ma/pl_1' });

    const link = await chari.paymentLinks.create({
      amount: 149.9,
      description: 'Order #1234',
      acceptUrl: 'https://shop.example.com/success',
    });

    expect(link.reference).toBe('pl_1');
    expect(calls[0]!.url).toContain('/v1/payment-links');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(calls[0]!.init.body as string).amount).toBe(149.9);
  });

  it('honours a caller-supplied idempotency key', async () => {
    const { chari, calls } = client({ reference: 'pl_1' });
    await chari.paymentLinks.create({ amount: 10, description: '' }, { idempotencyKey: 'mine' });
    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe('mine');
  });

  it('lists links', async () => {
    const { chari, calls } = client({ content: [], totalPages: 1, number: 0 });
    await chari.paymentLinks.list({ size: 5 });
    expect(calls[0]!.url).toContain('/v1/payment-links?');
    expect(calls[0]!.url).toContain('size=5');
  });

  it('retrieves, cancels and sends', async () => {
    const { chari, calls } = client({ reference: 'pl_1' });
    await chari.paymentLinks.retrieve('pl_1');
    await chari.paymentLinks.cancel('pl_1');
    await chari.paymentLinks.send('pl_1', { email: 'buyer@example.com' });

    expect(calls[0]!.url).toContain('/v1/payment-links/pl_1');
    expect(calls[1]!.url).toContain('/v1/payment-links/pl_1/cancel');
    expect(calls[1]!.init.method).toBe('POST');
    expect(calls[2]!.url).toContain('/v1/payment-links/pl_1/send');
  });

  it('url-encodes the reference', async () => {
    const { chari, calls } = client({});
    await chari.paymentLinks.retrieve('pl/1 2');
    expect(calls[0]!.url).toContain('/v1/payment-links/pl%2F1%202');
  });

  it('fetches the QR as a PNG', async () => {
    const { chari } = client({}, { 'content-type': 'image/png' });
    const file = await chari.paymentLinks.qr('pl_1');
    expect(file.contentType).toBe('image/png');
  });

  it('fetches the poster as a PDF', async () => {
    const { chari, calls } = client({}, { 'content-type': 'application/pdf' });
    const file = await chari.paymentLinks.poster('pl_1');
    expect(file.contentType).toBe('application/pdf');
    expect(calls[0]!.url).toContain('/v1/payment-links/pl_1/poster');
  });
});
