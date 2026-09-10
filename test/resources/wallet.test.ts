import { describe, expect, it, vi } from 'vitest';
import { ChariPay } from '../../src/index.js';

function client(response: { status?: number; body?: unknown; headers?: Record<string, string> } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const isBinary = response.headers?.['content-type']?.startsWith('application/pdf');
    return new Response(
      isBinary ? new Uint8Array([0x25, 0x50, 0x44, 0x46]) : JSON.stringify(response.body ?? {}),
      { status: response.status ?? 200, headers: { 'content-type': 'application/json', ...(response.headers ?? {}) } },
    );
  });
  const chari = new ChariPay({ apiKey: 'chari_sk_test_EXAMPLE', fetch: fetchMock as unknown as typeof fetch });
  return { chari, calls };
}

describe('wallet', () => {
  it('GET /v1/wallet', async () => {
    const { chari, calls } = client({ body: { balance: 1200.5, currency: 'MAD' } });
    const balance = await chari.wallet.balance();
    expect(balance.balance).toBe(1200.5);
    expect(calls[0]!.url).toContain('/v1/wallet');
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('GET /v1/wallet/account', async () => {
    const { chari, calls } = client({ body: { rib: '0000', iban: 'MA64', bic: 'X' } });
    await chari.wallet.account();
    expect(calls[0]!.url).toContain('/v1/wallet/account');
  });

  it('GET /v1/wallet/account/rib-document returns a PDF', async () => {
    const { chari } = client({ headers: { 'content-type': 'application/pdf' } });
    const file = await chari.wallet.ribDocument();
    expect(file.contentType).toBe('application/pdf');
    expect(file.data.length).toBe(4);
  });

  it('POST /v1/wallet/cash-ins sends an idempotency key', async () => {
    const { chari, calls } = client({ body: { reference: 'ci_1' } });
    await chari.wallet.cashIn({ amount: 100 });
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ amount: 100 });
  });
});
