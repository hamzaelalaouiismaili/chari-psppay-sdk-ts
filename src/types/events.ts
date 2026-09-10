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

type Event<TType extends string, TData> = {
  type: TType;
  data: TData;
  /** The delivery's raw parsed body, for anything the typed view omits. */
  raw: unknown;
};

/**
 * A verified webhook event, narrowed by `type`:
 *
 * ```ts
 * if (event.type === 'payment.succeeded') {
 *   event.data.amount; // number | undefined
 * }
 * ```
 *
 * **This type is a deliberate approximation, not a closed set.** `type` here
 * is one of the 21 literals below so that narrowing on it — the whole point
 * of this union — works, editor autocomplete lists real event names, and a
 * `switch` reads naturally. But Chari Pay can and does send event types this
 * SDK doesn't know about yet (a new event added after this SDK shipped), and
 * `chari.webhooks.constructEvent` / `parseEvent` still return that delivery
 * rather than throwing — it just arrives *typed* as if it were one of the 21,
 * even though at runtime `event.type` may hold a string outside that set.
 *
 * Practical consequences:
 * - **Keep a `default` branch in every `switch (event.type)`**, and an
 *   `else` after your last `if`/`else if` chain. An unrecognised delivery
 *   silently falls through every specific case and lands there.
 * - **Do not rely on exhaustiveness checking** (e.g. `const _exhaustive: never
 *   = event.type` after handling all 21 cases) to catch a missing case —
 *   it will compile even though a real, unhandled event type can still
 *   arrive at runtime. That check is misleading here by design.
 * - If you want to *verify* a type is really one of the 21 rather than
 *   assume it, use the exported `isKnownEventType(event.type)` type guard
 *   (backed by `CHARI_PAY_EVENT_TYPES`), or narrow explicitly with
 *   `ChariPayUnknownEvent` for the unrecognised case. Both are sound;
 *   `ChariPayEvent` alone is not — it trades a little type-level soundness
 *   for the ergonomic `if (event.type === 'x')` every integration writes.
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
 * (a new event Chari Pay added after this SDK shipped, for example). `data`
 * is the raw parsed body, untyped — there is no per-category shape to give
 * it. Use this, plus `isKnownEventType`, when you want a sound check rather
 * than the `ChariPayEvent` approximation described above:
 *
 * ```ts
 * const event = chari.webhooks.constructEvent(body, headers);
 * if (isKnownEventType(event.type)) {
 *   // event.type: ChariPayEventType, verified against CHARI_PAY_EVENT_TYPES
 * } else {
 *   const unknownEvent: ChariPayUnknownEvent = event;
 * }
 * ```
 */
export interface ChariPayUnknownEvent {
  type: string;
  data: unknown;
  raw: unknown;
}

/**
 * Sound runtime check for whether `type` is one of the 21 names in
 * `CHARI_PAY_EVENT_TYPES`. `ChariPayEvent`'s `type` narrowing is an
 * approximation (see its doc comment) — this guard is the actual, honest
 * check, for anyone who wants to distinguish a genuinely known event from
 * one this SDK merely typed as if it were known.
 */
export function isKnownEventType(type: string): type is ChariPayEventType {
  return (CHARI_PAY_EVENT_TYPES as readonly string[]).includes(type);
}
