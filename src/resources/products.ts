import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { ProductOrder } from '../types/gaps.js';
import { BaseResource } from './base.js';

export type CreateProductParams = components['schemas']['CreateProductRequest'];
export type UpdateProductParams = components['schemas']['UpdateProductRequest'];
export type Product = components['schemas']['ProductResponse'];

export interface ListProductsParams extends PaginationParams {
  active?: boolean;
  search?: string;
}

/** A catalogue of sellable items, each with its own orders. */
export class ProductsResource extends BaseResource {
  create(params: CreateProductParams, options?: RequestOptions): Promise<Product> {
    return this.http.request<Product>({
      method: 'POST', path: '/v1/products', body: params, autoIdempotency: true, options,
    });
  }

  list(params: ListProductsParams = {}, options?: RequestOptions): PagePromise<Product> {
    return this.paginate<Product>('/v1/products', params as Record<string, unknown>, options);
  }

  retrieve(reference: string, options?: RequestOptions): Promise<Product> {
    return this.http.request<Product>({ method: 'GET', path: `/v1/products/${encodeURIComponent(reference)}`, options });
  }

  update(reference: string, params: UpdateProductParams, options?: RequestOptions): Promise<Product> {
    return this.http.request<Product>({
      method: 'PATCH', path: `/v1/products/${encodeURIComponent(reference)}`, body: params, options,
    });
  }

  /** Products are deactivated, never hard-deleted, so history stays intact. */
  deactivate(reference: string, options?: RequestOptions): Promise<Product> {
    return this.http.request<Product>({
      method: 'DELETE', path: `/v1/products/${encodeURIComponent(reference)}`, options,
    });
  }

  orders(reference: string, params: PaginationParams = {}, options?: RequestOptions): PagePromise<ProductOrder> {
    return this.paginate<ProductOrder>(
      `/v1/products/${encodeURIComponent(reference)}/orders`,
      params as Record<string, unknown>,
      options,
    );
  }
}
