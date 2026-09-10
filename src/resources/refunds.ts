import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { Refund } from '../types/gaps.js';
import { BaseResource } from './base.js';

export type CreateRefundParams = components['schemas']['RefundPaymentRequest'];

export interface ListRefundsParams extends PaginationParams {
  status?: string;
  from?: string;
  to?: string;
}

/**
 * Full or partial refunds of a successful payment.
 *
 * Every create carries an Idempotency-Key, so a retried call after a timeout
 * returns the original refund instead of issuing a second one.
 */
export class RefundsResource extends BaseResource {
  create(params: CreateRefundParams, options?: RequestOptions): Promise<Refund> {
    return this.http.request<Refund>({
      method: 'POST', path: '/v1/refunds', body: params, autoIdempotency: true, options,
    });
  }

  list(params: ListRefundsParams = {}, options?: RequestOptions): PagePromise<Refund> {
    return this.paginate<Refund>('/v1/refunds', params as Record<string, unknown>, options);
  }

  retrieve(reference: string, options?: RequestOptions): Promise<Refund> {
    return this.http.request<Refund>({ method: 'GET', path: `/v1/refunds/${encodeURIComponent(reference)}`, options });
  }
}
