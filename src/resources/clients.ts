import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import { BaseResource } from './base.js';

export type CreateClientParams = components['schemas']['CreateClientRequest'];
export type UpdateClientParams = components['schemas']['UpdateClientRequest'];
export type Client = components['schemas']['ClientResponse'];
export type ClientPaymentMethod = components['schemas']['ClientPaymentMethodResponse'];

export interface ListClientsParams extends PaginationParams {
  search?: string;
}

/** Saved buyers and the payment methods they have stored with you. */
export class ClientsResource extends BaseResource {
  create(params: CreateClientParams, options?: RequestOptions): Promise<Client> {
    return this.http.request<Client>({
      method: 'POST', path: '/v1/clients', body: params, autoIdempotency: true, options,
    });
  }

  list(params: ListClientsParams = {}, options?: RequestOptions): PagePromise<Client> {
    return this.paginate<Client>('/v1/clients', params as Record<string, unknown>, options);
  }

  retrieve(id: string, options?: RequestOptions): Promise<Client> {
    return this.http.request<Client>({ method: 'GET', path: `/v1/clients/${encodeURIComponent(id)}`, options });
  }

  update(id: string, params: UpdateClientParams, options?: RequestOptions): Promise<Client> {
    return this.http.request<Client>({
      method: 'PUT', path: `/v1/clients/${encodeURIComponent(id)}`, body: params, options,
    });
  }

  /** Named `del` because `delete` is a reserved word. */
  del(id: string, options?: RequestOptions): Promise<void> {
    return this.http.request<void>({ method: 'DELETE', path: `/v1/clients/${encodeURIComponent(id)}`, options });
  }

  listPaymentMethods(id: string, options?: RequestOptions): Promise<ClientPaymentMethod[]> {
    return this.http.request<ClientPaymentMethod[]>({
      method: 'GET', path: `/v1/clients/${encodeURIComponent(id)}/payment-methods`, options,
    });
  }

  setDefaultPaymentMethod(id: string, paymentMethodId: string, options?: RequestOptions): Promise<ClientPaymentMethod> {
    return this.http.request<ClientPaymentMethod>({
      method: 'POST',
      path: `/v1/clients/${encodeURIComponent(id)}/payment-methods/${encodeURIComponent(paymentMethodId)}/default`,
      autoIdempotency: true,
      options,
    });
  }

  deletePaymentMethod(id: string, paymentMethodId: string, options?: RequestOptions): Promise<void> {
    return this.http.request<void>({
      method: 'DELETE',
      path: `/v1/clients/${encodeURIComponent(id)}/payment-methods/${encodeURIComponent(paymentMethodId)}`,
      options,
    });
  }
}
