import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function paged(pages: Array<{ content: unknown[]; totalPages: number; number: number }>) {
  const calls: string[] = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    const body = pages[Math.min(i++, pages.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('transactions', () => {
  it('lists with filters', async () => {
    const { chari, calls } = paged([{ content: [{ operationId: 1 }], totalPages: 1, number: 0 }]);

    const page = await chari.transactions.list({ status: 'SUCCESS', type: 'PAYMENT', page: 0, size: 20 });

    expect(page.content).toHaveLength(1);
    expect(calls[0]).toContain('/v1/transactions?');
    expect(calls[0]).toContain('status=SUCCESS');
    expect(calls[0]).toContain('type=PAYMENT');
    expect(calls[0]).toContain('size=20');
  });

  it('auto-pages across pages', async () => {
    const { chari, calls } = paged([
      { content: [{ operationId: 1 }, { operationId: 2 }], totalPages: 2, number: 0 },
      { content: [{ operationId: 3 }], totalPages: 2, number: 1 },
    ]);

    const all = await chari.transactions.list().autoPagingToArray({ limit: 10 });

    expect(all).toHaveLength(3);
    expect(calls[1]).toContain('page=1');
  });

  it('starts a single await at the caller\'s page, not page 0', async () => {
    const { chari, calls } = paged([{ content: [{ operationId: 1 }], totalPages: 5, number: 2 }]);
    await chari.transactions.list({ page: 2 });
    expect(calls[0]).toContain('page=2');
  });

  it('treats the caller\'s page as a starting offset while iterating, not a pin', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      // totalPages left generous so the loop keeps walking forward instead of
      // terminating -- the test controls how many pages it consumes itself.
      const body = { content: [{ operationId: calls.length }], totalPages: 10, number: 0 };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });

    let n = 0;
    for await (const tx of chari.transactions.list({ page: 2 })) {
      void tx;
      n += 1;
      if (n >= 3) break;
    }

    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('page=2');
    expect(calls[1]).toContain('page=3');
    expect(calls[2]).toContain('page=4');
  });

  it('retrieves one transaction', async () => {
    const { chari, calls } = paged([{ content: [], totalPages: 1, number: 0 }]);
    await chari.transactions.retrieve('op_42');
    expect(calls[0]).toContain('/v1/transactions/op_42');
  });

  it('fetches a timeline', async () => {
    const { chari, calls } = paged([{ content: [], totalPages: 1, number: 0 }]);
    await chari.transactions.timeline('op_42');
    expect(calls[0]).toContain('/v1/transactions/op_42/timeline');
  });

  it('exports CSV as a file', async () => {
    const fetchMock = vi.fn(async () => new Response(new TextEncoder().encode('id,amount\n1,10'), {
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="tx.csv"' },
    }));
    const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });

    const file = await chari.transactions.exportCsv({ status: 'SUCCESS' });

    expect(file.contentType).toBe('text/csv');
    expect(file.filename).toBe('tx.csv');
    expect(file.data.toString()).toContain('id,amount');
  });
});
