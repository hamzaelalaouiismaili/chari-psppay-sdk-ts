import type { components } from '../generated/api.js';
import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import { BaseResource } from './base.js';

export type WebhookDelivery = components['schemas']['WebhookEventResponse'];
export type WebhookEventType = components['schemas']['WebhookEventTypeResponse'];

const BASE = '/api/v1/partner/webhooks';

export interface ListWebhookDeliveriesParams extends PaginationParams {
  eventType?: string;
  endpointId?: string;
  status?: string;
  from?: string;
  to?: string;
}

/** The delivery log: what Chari Pay sent you, and how it went. */
export class WebhookEventsResource extends BaseResource {
  list(params: ListWebhookDeliveriesParams = {}, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return this.paginate<WebhookDelivery>(`${BASE}/events`, params as Record<string, unknown>, options);
  }

  /** One delivery in full, including the payload, so you can replay it locally. */
  retrieve(deliveryId: string, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.http.request<WebhookDelivery>({
      method: 'GET', path: `${BASE}/events/${encodeURIComponent(deliveryId)}`, options,
    });
  }

  /** Every event type you can subscribe an endpoint to. */
  listTypes(options?: RequestOptions): Promise<WebhookEventType[]> {
    return this.http.request<WebhookEventType[]>({ method: 'GET', path: `${BASE}/event-types`, options });
  }
}
