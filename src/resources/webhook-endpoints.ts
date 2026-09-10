import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import { BaseResource } from './base.js';

export type WebhookEndpointParams = components['schemas']['WebhookEndpointRequest'];
export type WebhookEndpoint = components['schemas']['WebhookEndpointResponse'];

const BASE = '/api/v1/partner/webhooks/endpoints';

/**
 * Manage the URLs Chari Pay delivers events to.
 *
 * These operations sit under `/api/v1/partner/…`, unlike the rest of the API.
 */
export class WebhookEndpointsResource extends BaseResource {
  create(params: WebhookEndpointParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'POST', path: BASE, body: params, autoIdempotency: true, options,
    });
  }

  list(params: PaginationParams = {}, options?: RequestOptions): PagePromise<WebhookEndpoint> {
    return this.paginate<WebhookEndpoint>(BASE, params as Record<string, unknown>, options);
  }

  retrieve(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({ method: 'GET', path: `${BASE}/${encodeURIComponent(id)}`, options });
  }

  update(id: string, params: Partial<WebhookEndpointParams>, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'PATCH', path: `${BASE}/${encodeURIComponent(id)}`, body: params, options,
    });
  }

  del(id: string, options?: RequestOptions): Promise<void> {
    return this.http.request<void>({ method: 'DELETE', path: `${BASE}/${encodeURIComponent(id)}`, options });
  }

  activate(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'POST', path: `${BASE}/${encodeURIComponent(id)}/activate`, autoIdempotency: true, options,
    });
  }

  /**
   * Issues a new signing secret. During rotation Chari Pay signs deliveries
   * with both the old and new secrets, so verify against either until you have
   * finished deploying: pass both to `verifyWebhookSignature` / `Webhooks` /
   * `ChariPayConfig.webhookSecret` / the Express and NestJS adapters — every
   * one of them accepts `string | string[]` for exactly this reason, and
   * verification succeeds if any supplied secret matches.
   *
   * ```ts
   * chari.webhooks.verify(rawBody, headers, [newSecret, oldSecret]);
   * ```
   */
  rotateSecret(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'POST', path: `${BASE}/${encodeURIComponent(id)}/rotate-secret`, autoIdempotency: true, options,
    });
  }

  /** Sends a synthetic delivery so you can prove your receiver works. */
  sendTestEvent(id: string, params?: { eventType?: string }, options?: RequestOptions): Promise<unknown> {
    return this.http.request<unknown>({
      method: 'POST', path: `${BASE}/${encodeURIComponent(id)}/test`, body: params, autoIdempotency: true, options,
    });
  }
}
