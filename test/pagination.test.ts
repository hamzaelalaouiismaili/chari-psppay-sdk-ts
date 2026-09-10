import { describe, expect, it, vi } from 'vitest';
import { PagePromise, type Page } from '../src/pagination.js';

/** Three pages of two items: 1..5. */
function fakePages(): (page: number) => Promise<Page<number>> {
  const data = [[1, 2], [3, 4], [5]];
  return async (page: number) => ({
    content: data[page] ?? [],
    number: page,
    size: 2,
    totalElements: 5,
    totalPages: 3,
  });
}

describe('PagePromise', () => {
  it('awaits to the first page', async () => {
    const page = await new PagePromise(fakePages());
    expect(page.content).toEqual([1, 2]);
    expect(page.totalElements).toBe(5);
  });

  it('iterates every item across pages', async () => {
    const seen: number[] = [];
    for await (const item of new PagePromise(fakePages())) seen.push(item);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('collects into an array up to the limit', async () => {
    const all = await new PagePromise(fakePages()).autoPagingToArray({ limit: 4 });
    expect(all).toEqual([1, 2, 3, 4]);
  });

  it('stops requesting once the limit is reached', async () => {
    const fetcher = vi.fn(fakePages());
    await new PagePromise(fetcher).autoPagingToArray({ limit: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stops on an empty page even when totalPages lies', async () => {
    const fetcher = vi.fn(async (page: number) => ({
      content: page === 0 ? [1] : [],
      number: page,
      totalPages: 99,
    }));
    const seen: number[] = [];
    for await (const item of new PagePromise(fetcher)) seen.push(item);
    expect(seen).toEqual([1]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses an unbounded autoPagingToArray', async () => {
    // @ts-expect-error limit is required, on purpose
    await expect(new PagePromise(fakePages()).autoPagingToArray()).rejects.toThrow(/limit/);
  });

  it('refuses a non-positive limit with the guard\'s own message', async () => {
    // Calling with no argument at all rejects via a native TypeError from
    // destructuring `undefined` — its message happens to contain "limit" too,
    // but that's not evidence the implementation's own guard ever runs. Passing
    // an explicit non-positive `limit` exercises that guard directly.
    await expect(new PagePromise(fakePages()).autoPagingToArray({ limit: 0 })).rejects.toThrow(
      'autoPagingToArray requires a positive `limit`.',
    );
  });

  it('tolerates a bare array response', async () => {
    const page = await new PagePromise(async () => [7, 8] as unknown as Page<number>);
    expect(page.content).toEqual([7, 8]);
  });
});
