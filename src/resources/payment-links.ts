import type { components } from '../generated/api.js';
import type { ChariPayFile } from '../file.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { WithMetadata } from '../types/metadata.js';
import { BaseResource } from './base.js';

export type CreatePaymentLinkParams = WithMetadata<components['schemas']['CreatePaymentLinkRequest']>;
export type PaymentLink = WithMetadata<components['schemas']['PaymentLinkResponse']>;
export type SendPaymentLinkParams = components['schemas']['SendPaymentLinkRequest'];

export interface ListPaymentLinksParams extends PaginationParams {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Reusable or single-use links to a hosted payment page.
 *
 * ```ts
 * const link = await chari.paymentLinks.create({
 *   amount: 149.9,
 *   description: 'Order #1234',
 *   acceptUrl: 'https://shop.example.com/success',
 * });
 * console.log(link.payUrl);
 * ```
 */
export class PaymentLinksResource extends BaseResource {
  create(params: CreatePaymentLinkParams, options?: RequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'POST',
      path: '/v1/payment-links',
      body: params,
      autoIdempotency: true,
      options,
    });
  }

  list(params: ListPaymentLinksParams = {}, options?: RequestOptions): PagePromise<PaymentLink> {
    return this.paginate<PaymentLink>('/v1/payment-links', params as Record<string, unknown>, options);
  }

  retrieve(reference: string, options?: RequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'GET',
      path: `/v1/payment-links/${encodeURIComponent(reference)}`,
      options,
    });
  }

  /** Stops the link from accepting further payments. */
  cancel(reference: string, options?: RequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'POST',
      path: `/v1/payment-links/${encodeURIComponent(reference)}/cancel`,
      autoIdempotency: true,
      options,
    });
  }

  /** E-mails the link to the buyer. */
  send(reference: string, params: SendPaymentLinkParams, options?: RequestOptions): Promise<void> {
    return this.http.request<void>({
      method: 'POST',
      path: `/v1/payment-links/${encodeURIComponent(reference)}/send`,
      body: params,
      autoIdempotency: true,
      options,
    });
  }

  /** A scannable QR code for the link, as a PNG. */
  qr(reference: string, options?: RequestOptions): Promise<ChariPayFile> {
    return this.http.requestBinary({
      method: 'GET',
      path: `/v1/payment-links/${encodeURIComponent(reference)}/qr`,
      options,
    });
  }

  /** A printable in-store poster for the link, as a PDF. */
  poster(reference: string, options?: RequestOptions): Promise<ChariPayFile> {
    return this.http.requestBinary({
      method: 'GET',
      path: `/v1/payment-links/${encodeURIComponent(reference)}/poster`,
      options,
    });
  }
}
