import type { RequestOptions } from '../http.js';
import type { PagePromise, PaginationParams } from '../pagination.js';
import type { JourneyEvent, JourneySummary } from '../types/gaps.js';
import { BaseResource } from './base.js';

/** Resource families that have a buyer journey attached. */
export type JourneyResourceType = 'payment-link' | 'payment-session' | 'subscription' | (string & {});

/** How buyers moved through a hosted payment, step by step. */
export class AnalyticsResource extends BaseResource {
  journeySummary(
    resourceType: JourneyResourceType,
    resourceId: string,
    options?: RequestOptions,
  ): Promise<JourneySummary> {
    return this.http.request<JourneySummary>({
      method: 'GET',
      path: `/v1/analytics/journeys/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/summary`,
      options,
    });
  }

  journeyEvents(
    resourceType: JourneyResourceType,
    resourceId: string,
    params: PaginationParams = {},
    options?: RequestOptions,
  ): PagePromise<JourneyEvent> {
    return this.paginate<JourneyEvent>(
      `/v1/analytics/journeys/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/events`,
      params as Record<string, unknown>,
      options,
    );
  }
}
