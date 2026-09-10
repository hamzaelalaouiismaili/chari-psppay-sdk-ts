import { describe, expect, it } from 'vitest';
import {
  ChariPayAPIError,
  ChariPayAuthenticationError,
  ChariPayError,
  ChariPayPermissionError,
  ChariPayRateLimitError,
  ChariPayValidationError,
  errorFromResponse,
} from '../src/errors.js';

const envelope = (code: string, message = 'boom') => ({
  error: { code, message },
  correlationId: 'corr_123',
});

describe('errorFromResponse', () => {
  it('maps 401 to an authentication error', () => {
    const err = errorFromResponse(401, envelope('UNAUTHORIZED'));
    expect(err).toBeInstanceOf(ChariPayAuthenticationError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.correlationId).toBe('corr_123');
  });

  it('maps 403 to a permission error', () => {
    expect(errorFromResponse(403, envelope('PRODUCTION_ACCESS_DENIED')))
      .toBeInstanceOf(ChariPayPermissionError);
  });

  it('maps 400 and 422 to validation errors', () => {
    expect(errorFromResponse(400, envelope('VALIDATION_ERROR'))).toBeInstanceOf(ChariPayValidationError);
    expect(errorFromResponse(422, envelope('WALLET_NOT_ACTIVE'))).toBeInstanceOf(ChariPayValidationError);
  });

  it('maps 429 and exposes retryAfter', () => {
    const err = errorFromResponse(429, envelope('RATE_LIMITED'), undefined, 30) as ChariPayRateLimitError;
    expect(err).toBeInstanceOf(ChariPayRateLimitError);
    expect(err.retryAfter).toBe(30);
  });

  it('maps 500 to an API error', () => {
    expect(errorFromResponse(500, envelope('INTERNAL'))).toBeInstanceOf(ChariPayAPIError);
  });

  it('survives a non-JSON body', () => {
    const err = errorFromResponse(502, 'upstream exploded');
    expect(err).toBeInstanceOf(ChariPayAPIError);
    expect(err.code).toBe('UPSTREAM_ERROR');
    expect(err.raw).toBe('upstream exploded');
  });

  it('prints the correlation id, which support asks for', () => {
    const err = errorFromResponse(422, envelope('WALLET_NOT_ACTIVE', 'Wallet is not active'));
    expect(String(err)).toContain('WALLET_NOT_ACTIVE');
    expect(String(err)).toContain('corr_123');
  });

  it('every subclass is a ChariPayError', () => {
    expect(errorFromResponse(401, envelope('UNAUTHORIZED'))).toBeInstanceOf(ChariPayError);
  });
});
