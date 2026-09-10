import { describe, expectTypeOf, it } from 'vitest';
import {
  isKnownEventType,
  type ChariPayEvent,
  type ChariPayEventType,
  type ChariPayUnknownEvent,
  type PaymentEventData,
  type RefundEventData,
} from '../src/index.js';

/**
 * Type-level proof that `ChariPayEvent` narrows correctly on `type` alone —
 * no extra discriminant needed — for both a shared field (`amount`) and a
 * field unique to a single payload interface (`transactionReference`, only
 * on `RefundEventData`). This is the shape round 2 settled on: `ChariPayEvent`
 * is a pure 21-member union with no catch-all, so ordinary TypeScript
 * discriminated-union narrowing applies with no workaround required.
 *
 * These are compile-time assertions, enforced by `tsc --noEmit`; `vitest run`
 * strips types before executing; run `tsc --noEmit` to actually prove them.
 */
describe('ChariPayEvent narrowing (no extra discriminant required)', () => {
  it('narrows a shared field (amount) to its declared type on payment.succeeded', () => {
    const event = {} as ChariPayEvent;
    if (event.type === 'payment.succeeded') {
      expectTypeOf(event.data.amount).toEqualTypeOf<number | undefined>();
    }
  });

  it('narrows an explicit field (reference) to its declared type on payment.succeeded', () => {
    const event = {} as ChariPayEvent;
    if (event.type === 'payment.succeeded') {
      expectTypeOf(event.data.reference).toEqualTypeOf<string | undefined>();
    }
  });

  it('narrows a field unique to PaymentEventData (redirectionUrl) on payment.succeeded', () => {
    const event = {} as ChariPayEvent;
    if (event.type === 'payment.succeeded') {
      expectTypeOf(event.data.redirectionUrl).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.data).toEqualTypeOf<PaymentEventData>();
    }
  });

  it('narrows a field unique to RefundEventData (transactionReference) on refund.succeeded', () => {
    const event = {} as ChariPayEvent;
    if (event.type === 'refund.succeeded') {
      expectTypeOf(event.data.transactionReference).toEqualTypeOf<string | undefined>();
      expectTypeOf(event.data).toEqualTypeOf<RefundEventData>();
    }
  });

  it('a switch narrows the same way, case by case', () => {
    const event = {} as ChariPayEvent;
    switch (event.type) {
      case 'payment.succeeded':
        expectTypeOf(event.data.amount).toEqualTypeOf<number | undefined>();
        break;
      case 'refund.succeeded':
        expectTypeOf(event.data.transactionReference).toEqualTypeOf<string | undefined>();
        break;
      default:
        // Reachable at runtime for an event type outside the 21 — see
        // ChariPayEvent's doc comment on why this is an approximation and
        // exhaustiveness checking here would be misleading.
        break;
    }
  });
});

describe('isKnownEventType — the sound escape hatch', () => {
  it('narrows a plain string to ChariPayEventType', () => {
    const type: string = 'payment.succeeded';
    if (isKnownEventType(type)) {
      expectTypeOf(type).toEqualTypeOf<ChariPayEventType>();
    }
  });

  it('an unrecognised type string is still assignable/handled without a compile error', () => {
    const type: string = 'payment.teleported';
    if (isKnownEventType(type)) {
      expectTypeOf(type).toEqualTypeOf<ChariPayEventType>();
    } else {
      expectTypeOf(type).toEqualTypeOf<string>();
      const unknownEvent: ChariPayUnknownEvent = { type, data: undefined, raw: undefined };
      expectTypeOf(unknownEvent.data).toEqualTypeOf<unknown>();
    }
  });
});
