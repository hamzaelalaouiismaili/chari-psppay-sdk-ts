import { describe, expectTypeOf, it } from 'vitest';
import type {
  ChariPayEvent,
  ChariPayUnknownEvent,
  ChariPayWebhookEvent,
  PaymentEventData,
  RefundEventData,
} from '../src/index.js';

/**
 * Type-level proof for the fix in this round: `event.data` must narrow to
 * the exact per-category shape after checking `known` and `type`, for
 * fields shared across categories (`amount`) and fields unique to one
 * category (`transactionReference` only exists on `RefundEventData`).
 *
 * These are compile-time assertions. If the union regresses to leaking a
 * non-literal discriminant back into `ChariPayEvent`, `tsc` fails here
 * before any behavioural test runs.
 */
describe('ChariPayEvent / ChariPayWebhookEvent narrowing', () => {
  it('narrows a shared field (amount) to its declared type on payment.succeeded', () => {
    const event = {} as ChariPayWebhookEvent;
    if (event.known && event.type === 'payment.succeeded') {
      expectTypeOf(event.data.amount).toEqualTypeOf<number | undefined>();
    }
  });

  it('narrows an explicit field (reference) to its declared type on payment.succeeded', () => {
    const event = {} as ChariPayWebhookEvent;
    if (event.known && event.type === 'payment.succeeded') {
      expectTypeOf(event.data.reference).toEqualTypeOf<string | undefined>();
    }
  });

  it('narrows a field unique to PaymentEventData (redirectionUrl) on payment.succeeded', () => {
    const event = {} as ChariPayWebhookEvent;
    if (event.known && event.type === 'payment.succeeded') {
      expectTypeOf(event.data.redirectionUrl).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.data).toEqualTypeOf<PaymentEventData>();
    }
  });

  it('narrows a field unique to RefundEventData (transactionReference) on refund.succeeded', () => {
    const event = {} as ChariPayWebhookEvent;
    if (event.known && event.type === 'refund.succeeded') {
      expectTypeOf(event.data.transactionReference).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.data).toEqualTypeOf<RefundEventData>();
    }
  });

  it('narrows correctly with a nested `known` check too, not just `&&`', () => {
    const event = {} as ChariPayWebhookEvent;
    if (event.known) {
      if (event.type === 'refund.succeeded') {
        expectTypeOf(event.data.transactionReference).toEqualTypeOf<string | undefined>();
      }
    }
  });

  it('the pure ChariPayEvent union (no catch-all) narrows the same way directly', () => {
    const event = {} as ChariPayEvent;
    if (event.type === 'refund.succeeded') {
      expectTypeOf(event.data.transactionReference).toEqualTypeOf<string | undefined>();
    }
  });

  it('an unknown event type is representable and handled without a compile error', () => {
    const event = {} as ChariPayWebhookEvent;
    if (!event.known) {
      expectTypeOf(event.type).toEqualTypeOf<string>();
      expectTypeOf(event.data).toEqualTypeOf<unknown>();
      // Arbitrary, not-in-the-enum event names are assignable — this is the
      // "acceptable to require an explicit check" branch.
      const arbitrary: string = event.type;
      expectTypeOf(arbitrary).toEqualTypeOf<string>();
    }
    expectTypeOf<ChariPayUnknownEvent['known']>().toEqualTypeOf<false>();
  });

  it('ChariPayWebhookEvent is exactly ChariPayEvent | ChariPayUnknownEvent', () => {
    expectTypeOf<ChariPayWebhookEvent>().toEqualTypeOf<ChariPayEvent | ChariPayUnknownEvent>();
  });
});
