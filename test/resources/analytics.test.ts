import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

describe('analytics', () => {
  it('reads journey summary and events', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ content: [], totalPages: 1, number: 0 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });

    await chari.analytics.journeySummary('payment-link', 'pl_1');
    await chari.analytics.journeyEvents('payment-link', 'pl_1', { size: 10 });

    expect(calls[0]).toContain('/v1/analytics/journeys/payment-link/pl_1/summary');
    expect(calls[1]).toContain('/v1/analytics/journeys/payment-link/pl_1/events?');
    expect(calls[1]).toContain('size=10');
  });
});
