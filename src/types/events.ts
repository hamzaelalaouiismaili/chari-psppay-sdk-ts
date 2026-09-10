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
 * A verified webhook event, narrowed by `type`.
 *
 * ```ts
 * if (event.type === 'payment.succeeded') event.data.amount; // number | undefined
 * ```
 *
 * An event type this SDK does not know widens to `{ type: string; data: EventBase }`
 * rather than throwing, so a new Chari Pay event cannot break a deployed
 * integration. (`data` is typed as `EventBase` — an object with an index
 * signature — rather than `unknown`: TypeScript's discriminated-union
 * narrowing keeps a fallback member in scope whenever its discriminant is a
 * non-literal `string`, and pairing that fallback with a literal `unknown`
 * collapses every known member's `data` type to `unknown` too. `EventBase`
 * keeps the same "no throw, no assumed shape" contract at runtime while
 * letting the compiler narrow correctly.)
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
  | Event<'security.token_reused', SecurityEventData>
  | Event<string & {}, EventBase>;
