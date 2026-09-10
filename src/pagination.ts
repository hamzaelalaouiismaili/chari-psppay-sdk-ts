/** A Spring-style page, as every Chari Pay list endpoint returns. */
export interface Page<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  /** Zero-based page index. */
  number?: number;
  size?: number;
}

/** Query parameters accepted by every list endpoint. */
export interface PaginationParams {
  /** Zero-based page index. */
  page?: number;
  size?: number;
  sort?: string | string[];
}

/** Some endpoints answer with a bare array; normalise both shapes. */
export function toPage<T>(raw: unknown, requestedPage: number): Page<T> {
  if (Array.isArray(raw)) return { content: raw as T[], number: requestedPage };
  const page = (raw ?? {}) as Page<T>;
  return { ...page, content: Array.isArray(page.content) ? page.content : [] };
}

/**
 * The return type of every `list()`. Awaiting it yields one page; iterating it
 * walks every page transparently. It is a real `Promise<Page<T>>` — `.catch()`,
 * `.finally()`, `Promise.all([...])` and any `Promise<T>`-typed position all
 * work — while staying lazy: the underlying request is not issued until the
 * promise is actually consumed (via `then`/`catch`/`finally`/`await`) or
 * iterated, never from the constructor.
 *
 * ```ts
 * const page = await chari.transactions.list();          // one page
 * for await (const tx of chari.transactions.list()) {}   // all of them
 * chari.transactions.list().catch((err) => { ... });     // real Promise methods
 * ```
 */
export class PagePromise<T> implements Promise<Page<T>> {
  readonly [Symbol.toStringTag] = 'Promise';

  constructor(private readonly fetchPage: (page: number) => Promise<Page<T>>) {}

  then<R1 = Page<T>, R2 = never>(
    onfulfilled?: ((value: Page<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.fetchPage(0).then((raw) => toPage<T>(raw, 0)).then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<Page<T> | R> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Page<T>> {
    return this.then().finally(onfinally);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let index = 0;
    for (;;) {
      const raw = await this.fetchPage(index);
      const page = toPage<T>(raw, index);
      if (!page.content.length) return;
      for (const item of page.content) yield item;

      // The server's own `number` is the absolute page just returned; prefer
      // it over the loop-local `index`, which is relative to iteration start
      // and wrong once `paginate()` begins at a non-zero offset.
      const current = typeof page.number === 'number' ? page.number : index;
      // Trust an empty page over a totalPages that may be stale or absent.
      if (page.totalPages !== undefined && current + 1 >= page.totalPages) return;
      index += 1;
    }
  }

  /**
   * Collects items across pages. `limit` is required so nobody accidentally
   * pulls a year of transactions into memory.
   */
  async autoPagingToArray({ limit }: { limit: number }): Promise<T[]> {
    if (typeof limit !== 'number' || limit <= 0) {
      throw new TypeError('autoPagingToArray requires a positive `limit`.');
    }
    const out: T[] = [];
    for await (const item of this) {
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }
}
