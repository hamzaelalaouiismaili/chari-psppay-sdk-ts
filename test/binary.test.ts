import { describe, expect, it, vi } from 'vitest';
import { ChariPayAPIError } from '../src/errors.js';
import { HttpClient, type ResolvedConfig } from '../src/http.js';

function binaryStub(body: Uint8Array, headers: Record<string, string>, status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status, headers }));
  return fetchMock as unknown as typeof fetch;
}

function config(fetchMock: typeof fetch): ResolvedConfig {
  return {
    apiKey: 'chari_sk_test_EXAMPLE',
    baseUrl: 'https://api.example.test',
    timeout: 5000,
    maxRetries: 0,
    debug: false,
    fetch: fetchMock,
  };
}

describe('requestBinary', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it('returns bytes and the content type', async () => {
    const http = new HttpClient(config(binaryStub(png, { 'content-type': 'image/png' })));

    const file = await http.requestBinary({ method: 'GET', path: '/v1/payment-links/pl_1/qr' });

    expect(Buffer.isBuffer(file.data)).toBe(true);
    expect(Array.from(file.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(file.contentType).toBe('image/png');
  });

  it('extracts the filename from Content-Disposition', async () => {
    const http = new HttpClient(
      config(binaryStub(png, {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="transactions.csv"',
      })),
    );

    const file = await http.requestBinary({ method: 'GET', path: '/v1/transactions/export.csv' });

    expect(file.filename).toBe('transactions.csv');
  });

  it('falls back to octet-stream when the header is absent', async () => {
    const fetchMock = vi.fn(async () => new Response(png, { status: 200 })) as unknown as typeof fetch;
    const http = new HttpClient(config(fetchMock));

    const file = await http.requestBinary({ method: 'GET', path: '/v1/wallet/account/rib-document' });

    expect(file.contentType).toBe('application/octet-stream');
  });

  it('still raises a typed error when a binary endpoint fails with JSON', async () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'no such link' }, correlationId: 'c_1' }),
    );
    const http = new HttpClient(config(binaryStub(json, { 'content-type': 'application/json' }, 404)));

    const err = await http
      .requestBinary({ method: 'GET', path: '/v1/payment-links/nope/qr' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ChariPayAPIError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.correlationId).toBe('c_1');
  });

  it('pipes to a stream', async () => {
    const http = new HttpClient(config(binaryStub(png, { 'content-type': 'image/png' })));

    const file = await http.requestBinary({ method: 'GET', path: '/v1/payment-links/pl_1/qr' });
    const chunks: Buffer[] = [];
    for await (const chunk of file.toStream()) chunks.push(chunk as Buffer);

    expect(Buffer.concat(chunks).length).toBe(4);
  });
});
