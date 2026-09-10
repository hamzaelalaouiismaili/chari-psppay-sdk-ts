/**
 * Webhook event payloads.
 *
 * `api-1.yaml` enumerates the event *names* and defines `WebhookEventResponse`
 * (the delivery record served by the partner events API), but it defines no
 * per-event `data` schema. Every payload interface below is therefore
 * hand-modelled.
 *
 * @remarks Not defined in api-1.yaml; modelled from the endpoint descriptions.
 * Verify against captured sandbox deliveries before 1.0.0.
 */

/** Fields present on essentially every delivery. */
export interface EventBase {
  reference?: string;
  correlationId?: string;
  occurredAt?: string;
  [key: string]: unknown;
}

export interface PaymentEventData extends EventBase {
  operationId?: string | number;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  customerEmail?: string;
  /** Present on `payment.requires_action`: where to send the buyer for 3-D Secure. */
  redirectionUrl?: string;
}

export interface RefundEventData extends EventBase {
  transactionReference?: string;
  amount?: number;
  status?: string;
  reason?: string;
}

export interface PaymentLinkEventData extends EventBase {
  url?: string;
  amount?: number;
  description?: string;
  status?: string;
  expiresAt?: string;
}

export interface SubscriptionEventData extends EventBase {
  subscriptionReference?: string;
  amount?: number;
  frequency?: string;
  status?: string;
  failureReason?: string;
}

export interface WalletEventData extends EventBase {
  balance?: number;
  amount?: number;
  currency?: string;
  status?: string;
}

export interface SecurityEventData extends EventBase {
  ip?: string;
  endpointId?: string;
  detail?: string;
}

/** Every event name Chari Pay publishes. */
export const CHARI_PAY_EVENT_TYPES = [
  'payment.initiated',
  'payment.requires_action',
  'payment.succeeded',
  'payment.failed',
  'refund.initiated',
  'refund.succeeded',
  'refund.failed',
  'payment_link.created',
  'payment_link.updated',
  'payment_link.cancelled',
  'payment_link.expired',
  'subscription.payment_succeeded',
  'subscription.payment_failed',
  'subscription.canceled',
  'wallet.activated',
  'wallet.funded',
  'wallet.rejected',
  'wallet.transfer_completed',
  'security.invalid_signature',
  'security.rate_limit_exceeded',
  'security.token_reused',
] as const;

export type ChariPayEventType = (typeof CHARI_PAY_EVENT_TYPES)[number];

/**
 * `known` is `true` for every member of `ChariPayEvent` and `false` for
 * `ChariPayUnknownEvent`. TypeScript's discriminated-union narrowing cannot
 * exclude a union member whose discriminant is a non-literal `string` (which
 * is what `ChariPayUnknownEvent.type` necessarily is) just because `type`
 * doesn't match a specific literal in an `if` check — the member, and every
 * field access through it, stays in scope, so any field the fallback doesn't
 * share with the checked member collapses to `unknown`. Filtering first on
 * the literal `known` boolean — a real, disjoint discriminant — removes
 * `ChariPayUnknownEvent` from the type *before* `type` is checked, so the
 * remaining narrowing on `type` sees only the 21 literal-discriminant
 * members and works exactly as a normal discriminated union would.
 */
type Event<TType extends string, TData> = {
  known: true;
  type: TType;
  data: TData;
  /** The delivery's raw parsed body, for anything the typed view omits. */
  raw: unknown;
};

/**
 * A verified, *known* webhook event, narrowed by `type`.
 *
 * ```ts
 * if (event.known && event.type === 'payment.succeeded') {
 *   event.data.amount; // number | undefined
 * }
 * ```
 *
 * This union intentionally has no catch-all member. See `ChariPayWebhookEvent`
 * for what `chari.webhooks.constructEvent` actually returns, and the `known`
 * doc comment above for why the `known` check must come first.
 */
export type ChariPayEvent =
  | Event<'payment.initiated', PaymentEventData>
  | Event<'payment.requires_action', PaymentEventData>
  | Event<'payment.succeeded', PaymentEventData>
  | Event<'payment.failed', PaymentEventData>
  | Event<'refund.initiated', RefundEventData>
  | Event<'refund.succeeded', RefundEventData>
  | Event<'refund.failed', RefundEventData>
  | Event<'payment_link.created', PaymentLinkEventData>
  | Event<'payment_link.updated', PaymentLinkEventData>
  | Event<'payment_link.cancelled', PaymentLinkEventData>
  | Event<'payment_link.expired', PaymentLinkEventData>
  | Event<'subscription.payment_succeeded', SubscriptionEventData>
  | Event<'subscription.payment_failed', SubscriptionEventData>
  | Event<'subscription.canceled', SubscriptionEventData>
  | Event<'wallet.activated', WalletEventData>
  | Event<'wallet.funded', WalletEventData>
  | Event<'wallet.rejected', WalletEventData>
  | Event<'wallet.transfer_completed', WalletEventData>
  | Event<'security.invalid_signature', SecurityEventData>
  | Event<'security.rate_limit_exceeded', SecurityEventData>
  | Event<'security.token_reused', SecurityEventData>;

/**
 * A verified webhook delivery whose event type this SDK does not recognize
 * (a new event Chari Pay added after this SDK shipped, for example).
 *
 * `known` is always `false`. `data` is the raw parsed body, untyped — there
 * is no per-category shape to give it.
 */
export interface ChariPayUnknownEvent {
  known: false;
  type: string;
  data: unknown;
  raw: unknown;
}

/**
 * What `chari.webhooks.constructEvent` (and `parseEvent`) actually return:
 * one of the 21 known events, or an unrecognized delivery. Check `known`
 * before narrowing on `type`:
 *
 * ```ts
 * const event = chari.webhooks.constructEvent(body, headers);
 * if (event.known && event.type === 'payment.succeeded') {
 *   event.data.amount; // number | undefined
 * } else if (!event.known) {
 *   // event.type is an arbitrary string here; event.data is unknown.
 * }
 * ```
 *
 * An event type this SDK does not know still does not throw — it becomes a
 * `ChariPayUnknownEvent` — so a new Chari Pay event cannot break a deployed
 * integration.
 */
export type ChariPayWebhookEvent = ChariPayEvent | ChariPayUnknownEvent;
