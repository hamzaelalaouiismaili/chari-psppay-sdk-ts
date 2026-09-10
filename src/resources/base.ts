import type { HttpClient } from '../http.js';
import { PagePromise, toPage } from '../pagination.js';
import type { RequestOptions } from '../http.js';

/** Every resource namespace shares one HTTP client and owns its own paths. */
export abstract class BaseResource {
  constructor(protected readonly http: HttpClient) {}

  /**
   * Wraps a list endpoint as a `PagePromise`: await it for one page, iterate it
   * for everything. The zero-based `page` parameter is injected per fetch.
   */
  protected paginate<T>(
    path: string,
    query: Record<string, unknown> | undefined,
    options: RequestOptions | undefined,
  ): PagePromise<T> {
    return new PagePromise<T>(async (page) => {
      const raw = await this.http.request<unknown>({
        method: 'GET',
        path,
        // The caller's `page` is the starting offset; iteration advances from it.
        query: { ...query, page: (typeof query?.page === 'number' ? query.page : 0) + page },
        options,
      });
      return toPage<T>(raw, page);
    });
  }
}
