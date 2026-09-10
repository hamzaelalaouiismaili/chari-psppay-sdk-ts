import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { WithMetadata } from '../types/metadata.js';
import { BaseResource } from './base.js';

// `metadata` sits at the top level of `CreateCheckoutSessionRequest`, a
// sibling of `config` — not nested under it.
export type CreateCheckoutSessionParams = WithMetadata<components['schemas']['CreateCheckoutSessionRequest']>;
export type CheckoutSession = components['schemas']['CheckoutSessionView'];

export interface ListCheckoutSessionsParams extends PaginationParams {
  status?: string;
  from?: string;
  to?: string;
}

/**
 * Server-created payment sessions. Create one, then either redirect the buyer
 * to the hosted page or drive `chari.checkout.*` yourself.
 */
export class CheckoutSessionsResource extends BaseResource {
  create(params: CreateCheckoutSessionParams, options?: RequestOptions): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: 'POST',
      path: '/v1/payment-sessions',
      body: params,
      autoIdempotency: true,
      options,
    });
  }

  list(params: ListCheckoutSessionsParams = {}, options?: RequestOptions): PagePromise<CheckoutSession> {
    return this.paginate<CheckoutSession>('/v1/payment-sessions', params as Record<string, unknown>, options);
  }

  retrieve(sessionId: string, options?: RequestOptions): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: 'GET',
      path: `/v1/payment-sessions/${encodeURIComponent(sessionId)}`,
      options,
    });
  }

  cancel(sessionId: string, options?: RequestOptions): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: 'POST',
      path: `/v1/payment-sessions/${encodeURIComponent(sessionId)}/cancel`,
      autoIdempotency: true,
      options,
    });
  }
}
