import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PublicPaymentStatus } from '../types/gaps.js';
import { BaseResource } from './base.js';

export type CheckoutVerifyParams = components['schemas']['CheckoutVerifyRequest'];
export type CheckoutSubmitParams = components['schemas']['CheckoutSubmitRequest'];
export type CheckoutSubmitResult = components['schemas']['CheckoutSubmitResponse'];
export type CheckoutReturnParams = components['schemas']['CheckoutReturnRequest'];
export type CheckoutReturnResult = components['schemas']['CheckoutReturnResponse'];
export type CheckoutSessionView = components['schemas']['CheckoutSessionView'];

/**
 * The direct-API checkout: pay a session server-to-server, without the hosted
 * page.
 *
 * **These four operations are public.** `api-1.yaml` declares them
 * `security: []` and their descriptions state "No API key — do not send
 * X-CHARI-PAY-API-KEY", so every call here sets `isPublic: true` and the auth
 * header is omitted.
 *
 * Handling raw card data puts you in PCI DSS scope. Use a hosted payment link
 * or the hosted session page unless you are certain you need this.
 */
export class CheckoutResource extends BaseResource {
  /** Opens a session for payment. Must precede `submit`; single-use `vk`s burn. */
  verify(params: CheckoutVerifyParams, options?: RequestOptions): Promise<CheckoutSessionView> {
    return this.http.request<CheckoutSessionView>({
      method: 'POST',
      path: '/checkout/verify',
      body: params,
      isPublic: true,
      options,
    });
  }

  /**
   * Pays a verified session with a card. Returns a terminal status, or
   * `PENDING_3DS` with a `redirectionUrl` the buyer must open — after which you
   * call `confirmReturn`.
   *
   * The Idempotency-Key is required for a reusable session, so it is always sent.
   */
  submit(params: CheckoutSubmitParams, options?: RequestOptions): Promise<CheckoutSubmitResult> {
    return this.http.request<CheckoutSubmitResult>({
      method: 'POST',
      path: '/checkout/submit',
      body: params,
      isPublic: true,
      autoIdempotency: true,
      options,
    });
  }

  /** Finalises a payment after the buyer returns from the 3-D Secure challenge. */
  confirmReturn(params: CheckoutReturnParams, options?: RequestOptions): Promise<CheckoutReturnResult> {
    return this.http.request<CheckoutReturnResult>({
      method: 'POST',
      path: '/checkout/return',
      body: params,
      isPublic: true,
      options,
    });
  }

  /** Public status of a payment, safe to poll from a buyer-facing page. */
  paymentStatus(reference: string, options?: RequestOptions): Promise<PublicPaymentStatus> {
    return this.http.request<PublicPaymentStatus>({
      method: 'GET',
      path: `/checkout/payments/${encodeURIComponent(reference)}`,
      isPublic: true,
      options,
    });
  }
}
