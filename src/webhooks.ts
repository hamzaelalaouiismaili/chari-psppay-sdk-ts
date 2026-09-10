import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChariPaySignatureVerificationError } from './errors.js';
import type { ChariPayEvent } from './types/events.js';

/** Node hands headers over as strings or arrays; accept both. */
export type HeaderBag = Record<string, string | string[] | undefined>;

/** Chari Pay rejects a delivery whose timestamp drifts more than this. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const SIGNATURE_HEADERS = ['chari-webhook-signature', 'x-chari-signature'];
const TIMESTAMP_HEADERS = ['chari-webhook-timestamp', 'x-chari-timestamp'];
const EVENT_TYPE_HEADER = 'chari-event-type';

function header(headers: HeaderBag, names: string[]): string | undefined {
  const lower: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  for (const name of names) {
    const value = lower[name];
    if (Array.isArray(value)) return value[0];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export interface VerifyOptions {
  /** The untouched request bytes. Re-serialising a parsed body changes the digest. */
  rawBody: string | Buffer;
  headers: HeaderBag;
  /**
   * One secret, or several. During a secret rotation Chari Pay signs every
   * delivery with BOTH the old and the new secret until the rotation
   * finishes, so pass both (e.g. `[newSecret, oldSecret]`) and verification
   * succeeds if ANY of them matches.
   */
  secret: string | string[];
  /** Defaults to 300000 ms. */
  toleranceMs?: number;
  /** Injectable clock, for tests. */
  now?: number;
}

function toSecretList(secret: string | string[] | undefined): string[] {
  if (secret === undefined) return [];
  return (Array.isArray(secret) ? secret : [secret]).filter((s): s is string => Boolean(s));
}

/**
 * Verifies a delivery's HMAC signature.
 *
 * The signed string is `"<timestamp>.<rawBody>"`, and the timestamp is epoch
 * **milliseconds** — not seconds. Throws `ChariPaySignatureVerificationError`
 * on any failure; returns silently on success.
 *
 * `secret` accepts a single string or an array — during a rotation, Chari Pay
 * signs with both the old and new secret, so pass both and verification
 * succeeds against either.
 */
export function verifyWebhookSignature(opts: VerifyOptions): void {
  const { rawBody, headers } = opts;
  const secrets = toSecretList(opts.secret);
  const toleranceMs = opts.toleranceMs ?? SIGNATURE_TOLERANCE_MS;
  const now = opts.now ?? Date.now();

  if (secrets.length === 0) {
    throw new ChariPaySignatureVerificationError('No webhook secret provided; cannot verify the delivery.');
  }

  const signature = header(headers, SIGNATURE_HEADERS);
  if (!signature) {
    throw new ChariPaySignatureVerificationError(
      `Missing webhook signature header (expected one of: ${SIGNATURE_HEADERS.join(', ')}).`,
    );
  }

  const timestamp = header(headers, TIMESTAMP_HEADERS);
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    throw new ChariPaySignatureVerificationError(
      'Missing or malformed webhook timestamp header (expected epoch milliseconds).',
    );
  }

  if (Math.abs(now - Number(timestamp)) > toleranceMs) {
    throw new ChariPaySignatureVerificationError(
      `Webhook timestamp is outside the ${toleranceMs}ms tolerance. ` +
        'Check the clock on this host, and remember the timestamp is in milliseconds.',
    );
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const provided = Buffer.from(signature, 'hex');

  // Check every candidate secret — a rotation delivery is signed with both
  // the old and new secret, so any match verifies it. Each candidate goes
  // through the same length-then-timingSafeEqual comparison as the
  // single-secret path did, so this adds no timing signal beyond what
  // already existed per secret.
  const matched = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    return provided.length === expectedBuf.length && timingSafeEqual(expectedBuf, provided);
  });

  if (!matched) {
    throw new ChariPaySignatureVerificationError(
      'Webhook signature does not match. Confirm the secret, and that the raw request body reached the verifier unmodified.',
    );
  }
}

/**
 * Parses a verified delivery into a typed event.
 *
 * Chari Pay routes on the `chari-event-type` header; the body is flat and may
 * carry no type at all, so the body fields are only a fallback.
 *
 * The return type, `ChariPayEvent`, is a deliberate approximation — see its
 * doc comment. This function never throws for an unrecognised `type`; it
 * returns the delivery as-is (typed as if it were one of the 21 known
 * events), so a new Chari Pay event cannot break a deployed integration.
 * Use `isKnownEventType(event.type)` if you need a sound check instead.
 */
export function parseEvent(rawBody: string | Buffer, headers: HeaderBag): ChariPayEvent {
  const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ChariPaySignatureVerificationError('Webhook body is not valid JSON.');
  }

  const fromHeader = header(headers, [EVENT_TYPE_HEADER]);
  const fromBody =
    body && typeof body === 'object'
      ? ((body as Record<string, unknown>).type ??
         (body as Record<string, unknown>).event ??
         (body as Record<string, unknown>).eventType)
      : undefined;

  const type = fromHeader ?? (typeof fromBody === 'string' ? fromBody : 'unknown');
  return { type, data: body, raw: body } as ChariPayEvent;
}

/** `chari.webhooks` — verification and parsing, bound to the client's secret. */
export class Webhooks {
  constructor(private readonly defaultSecret?: string | string[]) {}

  /**
   * Verifies and parses a delivery in one call.
   *
   * ```ts
   * const event = chari.webhooks.constructEvent(req.rawBody, req.headers);
   * ```
   *
   * `secret` (and the client's `webhookSecret`) accept a single string or an
   * array — pass both the old and new secret while a rotation is in flight.
   */
  constructEvent(rawBody: string | Buffer, headers: HeaderBag, secret?: string | string[]): ChariPayEvent {
    const resolved = secret ?? this.defaultSecret;
    if (toSecretList(resolved).length === 0) {
      throw new ChariPaySignatureVerificationError(
        'No webhook secret. Pass one to constructEvent, or set `webhookSecret` on the ChariPay client.',
      );
    }
    verifyWebhookSignature({ rawBody, headers, secret: resolved as string | string[] });
    return parseEvent(rawBody, headers);
  }

  /** Verification only, when you want to parse the body yourself. */
  verify(rawBody: string | Buffer, headers: HeaderBag, secret?: string | string[]): void {
    verifyWebhookSignature({ rawBody, headers, secret: (secret ?? this.defaultSecret ?? '') as string | string[] });
  }
}

export type { ChariPayEvent, ChariPayUnknownEvent } from './types/events.js';
export { CHARI_PAY_EVENT_TYPES, isKnownEventType } from './types/events.js';
