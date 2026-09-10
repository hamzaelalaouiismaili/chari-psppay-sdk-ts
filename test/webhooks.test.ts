import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChariPay, ChariPaySignatureVerificationError } from '../src/index.js';
import { verifyWebhookSignature } from '../src/webhooks.js';

const SECRET = 'whsec_EXAMPLE';

/** Builds exactly what Chari Pay would POST. */
function signedDelivery(
  payload: Record<string, unknown>,
  secret = SECRET,
  over: { timestamp?: number; signature?: string; header?: string; eventType?: string } = {},
) {
  const rawBody = JSON.stringify(payload);
  const ts = String(over.timestamp ?? Date.now());
  const signature = over.signature ?? createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [over.header ?? 'chari-webhook-signature']: signature,
    'chari-webhook-timestamp': ts,
  };
  if (over.eventType) headers['chari-event-type'] = over.eventType;
  return { rawBody, headers };
}

describe('verifyWebhookSignature', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_700_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('accepts a valid delivery', () => {
    const { rawBody, headers } = signedDelivery({ reference: 'pl_1' });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).not.toThrow();
  });

  it('accepts the legacy x-chari-signature header used during rotation', () => {
    const { rawBody, headers } = signedDelivery({ reference: 'pl_1' }, SECRET, { header: 'x-chari-signature' });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).not.toThrow();
  });

  it('rejects a signature made with the wrong secret', () => {
    const { rawBody, headers } = signedDelivery({ reference: 'pl_1' }, 'whsec_WRONG');
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET }))
      .toThrow(ChariPaySignatureVerificationError);
  });

  it('rejects a tampered body', () => {
    const { headers } = signedDelivery({ amount: 10 });
    expect(() => verifyWebhookSignature({ rawBody: JSON.stringify({ amount: 1000 }), headers, secret: SECRET }))
      .toThrow(ChariPaySignatureVerificationError);
  });

  it('rejects a stale timestamp beyond the 5-minute tolerance', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 }, SECRET, { timestamp: Date.now() - 6 * 60 * 1000 });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).toThrow(/tolerance/i);
  });

  it('rejects a future timestamp beyond tolerance', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 }, SECRET, { timestamp: Date.now() + 6 * 60 * 1000 });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).toThrow(/tolerance/i);
  });

  it('treats the timestamp as milliseconds, not seconds', () => {
    // A seconds-based timestamp is ~1.7e9, i.e. decades away from Date.now().
    const { rawBody, headers } = signedDelivery({ a: 1 }, SECRET, { timestamp: Math.floor(Date.now() / 1000) });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).toThrow(/tolerance/i);
  });

  it('rejects a malformed hex signature without crashing', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 }, SECRET, { signature: 'deadbeef' });
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET }))
      .toThrow(ChariPaySignatureVerificationError);
  });

  it('rejects a missing signature header', () => {
    const { rawBody } = signedDelivery({ a: 1 });
    expect(() => verifyWebhookSignature({ rawBody, headers: {}, secret: SECRET })).toThrow(/signature/i);
  });

  it('rejects a non-numeric timestamp', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 });
    headers['chari-webhook-timestamp'] = 'yesterday';
    expect(() => verifyWebhookSignature({ rawBody, headers, secret: SECRET })).toThrow(/timestamp/i);
  });

  it('verifies a Buffer body identically to a string', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 });
    expect(() => verifyWebhookSignature({ rawBody: Buffer.from(rawBody), headers, secret: SECRET })).not.toThrow();
  });

  it('accepts array-valued headers, as Node delivers them', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 });
    const bag = { ...headers, 'chari-webhook-signature': [headers['chari-webhook-signature']!] };
    expect(() => verifyWebhookSignature({ rawBody, headers: bag, secret: SECRET })).not.toThrow();
  });
});

describe('constructEvent', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_700_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', webhookSecret: SECRET });

  it('reads the event type from the chari-event-type header', () => {
    const { rawBody, headers } = signedDelivery({ reference: 'pl_1', amount: 149.9 }, SECRET, {
      eventType: 'payment.succeeded',
    });

    const event = chari.webhooks.constructEvent(rawBody, headers);

    expect(event.type).toBe('payment.succeeded');
    if (event.type === 'payment.succeeded') expect(event.data.reference).toBe('pl_1');
  });

  it('falls back to a type field in the body', () => {
    const { rawBody, headers } = signedDelivery({ type: 'refund.succeeded', reference: 'rf_1' });
    expect(chari.webhooks.constructEvent(rawBody, headers).type).toBe('refund.succeeded');
  });

  it('does not throw on an unknown event type', () => {
    const { rawBody, headers } = signedDelivery({ reference: 'x' }, SECRET, { eventType: 'payment.teleported' });
    const event = chari.webhooks.constructEvent(rawBody, headers);
    expect(event.type).toBe('payment.teleported');
  });

  it('refuses to parse an unverified payload', () => {
    const { rawBody, headers } = signedDelivery({ a: 1 }, 'whsec_WRONG');
    expect(() => chari.webhooks.constructEvent(rawBody, headers)).toThrow(ChariPaySignatureVerificationError);
  });

  it('requires a secret from somewhere', () => {
    const bare = new ChariPay('chari_sk_test_EXAMPLE');
    const { rawBody, headers } = signedDelivery({ a: 1 });
    expect(() => bare.webhooks.constructEvent(rawBody, headers)).toThrow(/webhookSecret/);
  });
});
