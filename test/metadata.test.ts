import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ChariPay, type ChariPayMetadata } from '../src/index.js';
import type { CreatePaymentLinkParams, PaymentLink } from '../src/resources/payment-links.js';
import type { CreateSubscriptionParams, Subscription } from '../src/resources/subscriptions.js';
import type { CreateRefundParams } from '../src/resources/refunds.js';
import type { CreateProductParams, Product } from '../src/resources/products.js';
import type { CreateCheckoutSessionParams } from '../src/resources/checkout-sessions.js';

function client(body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

function sentBody(call: { init: RequestInit }): unknown {
  return JSON.parse(call.init.body as string);
}

/**
 * Before the fix, every `metadata` field generated from `api-1.yaml` rendered
 * as `{ [key: string]: Record<string, never> }` — a type only `{}` values
 * satisfy — so `metadata: { orderId: 'A-1' }` failed to compile on every one
 * of these. These are compile-time assertions (`tsc --noEmit` proves them;
 * `vitest run` strips types before executing) plus a runtime check that the
 * value reaching `fetch` is byte-identical to what was passed in.
 */
describe('metadata (types)', () => {
  it('ChariPayMetadata is a scalar-valued record, not `any`', () => {
    expectTypeOf<ChariPayMetadata>().toEqualTypeOf<Record<string, string | number | boolean | null>>();
  });

  it('accepts realistic metadata on every affected create/params type', () => {
    const metadata: ChariPayMetadata = { orderId: 'A-1', attempt: 1, verified: true, note: null };

    expectTypeOf(metadata).toMatchTypeOf<CreatePaymentLinkParams['metadata']>();
    expectTypeOf(metadata).toMatchTypeOf<CreateSubscriptionParams['metadata']>();
    expectTypeOf(metadata).toMatchTypeOf<CreateRefundParams['metadata']>();
    expectTypeOf(metadata).toMatchTypeOf<CreateProductParams['metadata']>();
    expectTypeOf(metadata).toMatchTypeOf<CreateCheckoutSessionParams['metadata']>();

    // Response types echo metadata back; readers should see the same shape.
    expectTypeOf<PaymentLink['metadata']>().toEqualTypeOf<ChariPayMetadata | undefined>();
    expectTypeOf<Subscription['metadata']>().toEqualTypeOf<ChariPayMetadata | undefined>();
    expectTypeOf<Product['metadata']>().toEqualTypeOf<ChariPayMetadata | undefined>();
  });

  it('metadata stays optional on every request type (unchanged required/optional-ness)', () => {
    expectTypeOf<CreatePaymentLinkParams>().toHaveProperty('metadata').toEqualTypeOf<ChariPayMetadata | undefined>();
    expectTypeOf<CreateSubscriptionParams>().toHaveProperty('metadata').toEqualTypeOf<
      ChariPayMetadata | undefined
    >();
    expectTypeOf<CreateRefundParams>().toHaveProperty('metadata').toEqualTypeOf<ChariPayMetadata | undefined>();
    expectTypeOf<CreateProductParams>().toHaveProperty('metadata').toEqualTypeOf<ChariPayMetadata | undefined>();
    expectTypeOf<CreateCheckoutSessionParams>().toHaveProperty('metadata').toEqualTypeOf<
      ChariPayMetadata | undefined
    >();
  });

  it('an unrelated required field is still required (the override did not weaken the type)', () => {
    // @ts-expect-error `description` is required on CreatePaymentLinkParams
    const _missingDescription: CreatePaymentLinkParams = { amount: 10, metadata: { orderId: 'A-1' } };
    void _missingDescription;
  });
});

describe('metadata (runtime — value reaches fetch unchanged)', () => {
  it('paymentLinks.create', async () => {
    const { chari, calls } = client({ reference: 'pl_1' });
    await chari.paymentLinks.create({ amount: 10, description: 'x', metadata: { orderId: 'A-1' } });
    expect(sentBody(calls[0]!)).toMatchObject({ metadata: { orderId: 'A-1' } });
  });

  it('subscriptions.create', async () => {
    const { chari, calls } = client({ reference: 'sub_1' });
    await chari.subscriptions.create({
      clientId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      amount: 99,
      description: 'Gold plan',
      frequency: 'MONTHLY',
      startDate: '2026-08-01',
      channels: ['EMAIL'],
      metadata: { customerId: 'cus_1001', plan: 'gold' },
    });
    expect(sentBody(calls[0]!)).toMatchObject({ metadata: { customerId: 'cus_1001', plan: 'gold' } });
  });

  it('refunds.create', async () => {
    const { chari, calls } = client({ reference: 'rf_1' });
    await chari.refunds.create({
      refundReference: 'rf_1',
      reason: 'requested_by_customer',
      metadata: { orderId: 'A-1' },
    });
    expect(sentBody(calls[0]!)).toMatchObject({ metadata: { orderId: 'A-1' } });
  });

  it('products.create', async () => {
    const { chari, calls } = client({ reference: 'prod_1' });
    await chari.products.create({
      name: 'Chari T-shirt',
      price: 100,
      metadata: { sku: 'TS-1' },
    });
    expect(sentBody(calls[0]!)).toMatchObject({ metadata: { sku: 'TS-1' } });
  });

  it('checkoutSessions.create', async () => {
    const { chari, calls } = client({ sessionId: 'ps_1' });
    await chari.checkoutSessions.create({
      amount: 250,
      orderId: 'ORD-2026-0001',
      config: {
        customer: {
          email: 'buyer@example.com',
          phone: '+212600000000',
          firstName: 'Amine',
          lastName: 'Bennani',
        },
      },
      metadata: { cartId: 'c_987', source: 'web' },
    });
    expect(sentBody(calls[0]!)).toMatchObject({ metadata: { cartId: 'c_987', source: 'web' } });
  });
});

describe('billingTime (LocalTime spec override)', () => {
  it('accepts the "HH:mm" string the API actually takes', () => {
    const params: CreateSubscriptionParams = {
      clientId: 'cl_1',
      amount: 99,
      description: 'Monthly plan',
      frequency: 'MONTHLY',
      startDate: '2026-01-01',
      channels: ['EMAIL'],
      billingTime: '09:00',
    } as CreateSubscriptionParams;
    expect(params.billingTime).toBe('09:00');
  });

  it('types billingTime as a string, not the generated LocalTime object', () => {
    expectTypeOf<CreateSubscriptionParams['billingTime']>().toEqualTypeOf<string | undefined>();
  });
});
