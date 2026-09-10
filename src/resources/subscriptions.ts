import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { SubscriptionCharge } from '../types/gaps.js';
import type { WithMetadata } from '../types/metadata.js';
import { BaseResource } from './base.js';

export type CreateSubscriptionParams = WithMetadata<components['schemas']['CreateSubscriptionRequest']>;
export type Subscription = WithMetadata<components['schemas']['SubscriptionResponse']>;
export type SelectSubscriptionPaymentMethodParams =
  components['schemas']['SelectSubscriptionPaymentMethodRequest'];
export type SubscriptionAutoPayTestResult = components['schemas']['SubscriptionAutoPayTestResponse'];

export interface ListSubscriptionsParams extends PaginationParams {
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELED';
  clientId?: string;
  search?: string;
}

/** Recurring billing: each period generates a charge (a payment link). */
export class SubscriptionsResource extends BaseResource {
  create(params: CreateSubscriptionParams, options?: RequestOptions): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: 'POST', path: '/v1/subscriptions', body: params, autoIdempotency: true, options,
    });
  }

  list(params: ListSubscriptionsParams = {}, options?: RequestOptions): PagePromise<Subscription> {
    return this.paginate<Subscription>('/v1/subscriptions', params as Record<string, unknown>, options);
  }

  retrieve(reference: string, options?: RequestOptions): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: 'GET', path: `/v1/subscriptions/${encodeURIComponent(reference)}`, options,
    });
  }

  /** Every charge the subscription has generated, most recent period first. */
  charges(reference: string, params: PaginationParams = {}, options?: RequestOptions): PagePromise<SubscriptionCharge> {
    return this.paginate<SubscriptionCharge>(
      `/v1/subscriptions/${encodeURIComponent(reference)}/charges`,
      params as Record<string, unknown>,
      options,
    );
  }

  pause(reference: string, options?: RequestOptions): Promise<Subscription> {
    return this.lifecycle(reference, 'pause', options);
  }

  resume(reference: string, options?: RequestOptions): Promise<Subscription> {
    return this.lifecycle(reference, 'resume', options);
  }

  cancel(reference: string, options?: RequestOptions): Promise<Subscription> {
    return this.lifecycle(reference, 'cancel', options);
  }

  /** Chooses which stored payment method auto-pay should charge. */
  selectPaymentMethod(
    reference: string,
    params: SelectSubscriptionPaymentMethodParams,
    options?: RequestOptions,
  ): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: 'PUT',
      path: `/v1/subscriptions/${encodeURIComponent(reference)}/payment-method`,
      body: params,
      options,
    });
  }

  /** Forces an auto-pay attempt. Sandbox only. */
  testAutoPay(reference: string, options?: RequestOptions): Promise<SubscriptionAutoPayTestResult> {
    return this.http.request<SubscriptionAutoPayTestResult>({
      method: 'POST',
      path: `/v1/subscriptions/${encodeURIComponent(reference)}/test-auto-pay`,
      autoIdempotency: true,
      options,
    });
  }

  private lifecycle(reference: string, verb: string, options?: RequestOptions): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: 'POST',
      path: `/v1/subscriptions/${encodeURIComponent(reference)}/${verb}`,
      autoIdempotency: true,
      options,
    });
  }
}
