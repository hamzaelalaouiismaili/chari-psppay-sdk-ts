import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ChariPaySignatureVerificationError, ChariPayWebhookSetupError } from '@chari-pay/sdk';
import { parseEvent, verifyWebhookSignature } from '@chari-pay/sdk/webhooks';
import type { ChariPayEvent } from '@chari-pay/sdk';

declare module 'express-serve-static-core' {
  interface Request {
    /** The verified, typed webhook event. Set by `chariPayWebhook()`. */
    chariPayEvent: ChariPayEvent;
    /** Untouched request bytes, when a body parser preserved them. */
    rawBody?: Buffer;
  }
}

export interface ChariPayWebhookOptions {
  /**
   * The endpoint's signing secret. Never hard-code it — read it from the
   * environment. Accepts an array during a secret rotation — Chari Pay signs
   * with both the old and new secret while one is in progress, so pass both
   * (e.g. `[newSecret, oldSecret]`) and verification succeeds against either.
   */
  secret: string | string[];
  /** Timestamp drift allowed, in ms. Default 300000. */
  toleranceMs?: number;
  /** Replaces the default `400` response on a verification failure. */
  onError?: (error: Error, req: Request, res: Response) => void;
  /**
   * Maximum size, in bytes, this middleware will buffer while reading the raw
   * request body itself (i.e. when nothing upstream already parsed it).
   * Exceeding it destroys the request and rejects with `ChariPayRawBodyTooLargeError`.
   * This is the recommended, unauthenticated mount, so an unbounded buffer is
   * a trivial memory-exhaustion DoS — default 1 MiB (1,048,576 bytes).
   */
  maxBodyBytes?: number;
  /**
   * Maximum time, in ms, this middleware will wait while reading the raw
   * request body itself. Exceeding it destroys the request and rejects with
   * `ChariPayRawBodyTimeoutError`, guarding against a slowloris-style drip
   * feed on this unauthenticated endpoint. Default 10000.
   */
  bodyTimeoutMs?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_BODY_TIMEOUT_MS = 10_000;

/** The raw webhook body exceeded `maxBodyBytes` while being buffered. */
export class ChariPayRawBodyTooLargeError extends Error {
  constructor(maxBodyBytes: number) {
    super(`Webhook request body exceeded the ${maxBodyBytes}-byte limit while buffering the raw body.`);
    this.name = 'ChariPayRawBodyTooLargeError';
  }
}

/** Reading the raw webhook body took longer than `bodyTimeoutMs`. */
export class ChariPayRawBodyTimeoutError extends Error {
  constructor(bodyTimeoutMs: number) {
    super(`Timed out after ${bodyTimeoutMs}ms reading the webhook request body.`);
    this.name = 'ChariPayRawBodyTimeoutError';
  }
}

/**
 * Use as `express.json({ verify: captureRawBody })` when a global JSON parser
 * runs before your webhook route. It keeps the untouched bytes on
 * `req.rawBody`, which is the only thing the signature can be checked against.
 */
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  if (buf?.length) req.rawBody = Buffer.from(buf);
}

/**
 * Verifies a Chari Pay delivery and attaches the typed event as
 * `req.chariPayEvent`.
 *
 * ```ts
 * app.post('/webhooks/chari-pay', chariPayWebhook({ secret: process.env.CHARI_PAY_WEBHOOK_SECRET! }), (req, res) => {
 *   if (req.chariPayEvent.type === 'payment.succeeded') fulfilOrder(req.chariPayEvent.data.reference);
 *   res.sendStatus(200);
 * });
 * ```
 *
 * Mount it on the route **before** any global `express.json()`, or use
 * `express.json({ verify: captureRawBody })`. Both work; nothing else can,
 * because re-serialising a parsed body changes the signature.
 */
export function chariPayWebhook(options: ChariPayWebhookOptions): RequestHandler {
  if (!options?.secret || (Array.isArray(options.secret) && options.secret.length === 0)) {
    throw new ChariPayWebhookSetupError('chariPayWebhook requires a `secret`.');
  }

  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;

  return function chariPayWebhookMiddleware(req: Request, res: Response, next: NextFunction): void {
    readRawBody(req, maxBodyBytes, bodyTimeoutMs)
      .then((rawBody) => {
        verifyWebhookSignature({
          rawBody,
          headers: req.headers as Record<string, string | string[] | undefined>,
          secret: options.secret,
          toleranceMs: options.toleranceMs,
        });
        req.rawBody = rawBody;
        req.chariPayEvent = parseEvent(rawBody, req.headers as Record<string, string | string[] | undefined>);
        next();
      })
      .catch((error: Error) => {
        if (error instanceof ChariPaySignatureVerificationError) {
          if (options.onError) return options.onError(error, req, res);
          res.status(400).json({ error: { code: error.code, message: error.message } });
          return;
        }
        if (error instanceof ChariPayRawBodyTooLargeError) {
          if (options.onError) return options.onError(error, req, res);
          // Close the connection once the response is flushed: this is an
          // unauthenticated endpoint, so there is no reason to keep serving
          // a connection that just tried to send an oversized body.
          res.set('Connection', 'close').status(413).json({ error: { code: 'BODY_TOO_LARGE', message: error.message } });
          return;
        }
        if (error instanceof ChariPayRawBodyTimeoutError) {
          if (options.onError) return options.onError(error, req, res);
          res.set('Connection', 'close').status(408).json({ error: { code: 'BODY_READ_TIMEOUT', message: error.message } });
          return;
        }
        // A setup problem is the developer's bug, not a bad delivery: surface it.
        if (options.onError) return options.onError(error, req, res);
        next(error);
      });
  };
}

/** Recovers the untouched bytes, or explains precisely why it cannot. */
function readRawBody(req: Request, maxBodyBytes: number, bodyTimeoutMs: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);

  if (req.readable && !req.complete) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;

      const onData = (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBodyBytes) {
          settle(() => reject(new ChariPayRawBodyTooLargeError(maxBodyBytes)));
          return;
        }
        chunks.push(chunk);
      };
      const onEnd = () => settle(() => resolve(Buffer.concat(chunks)));
      const onReqError = (err: Error) => settle(() => reject(err));
      const onTimeout = () => settle(() => reject(new ChariPayRawBodyTimeoutError(bodyTimeoutMs)));

      const timer = setTimeout(onTimeout, bodyTimeoutMs);

      // Only one outcome ever wins; always stop listening once it does. That
      // alone bounds memory: once nothing is reading the stream it stops
      // flowing, so no more chunks are buffered here (and — HTTP/1.1's own
      // flow control kicking in — the OS socket buffer, not this process,
      // absorbs whatever the sender still pushes). We deliberately do NOT
      // destroy the socket here, so the 413/408 response the caller writes
      // next still reaches the client instead of failing to send.
      function settle(run: () => void): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.off('data', onData);
        req.off('end', onEnd);
        req.off('error', onReqError);
        run();
      }

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onReqError);
    });
  }

  return Promise.reject(
    new ChariPayWebhookSetupError(
      'The raw request body was already consumed, so the webhook signature cannot be verified. ' +
        'Fix it either by mounting chariPayWebhook() on the route before express.json(), ' +
        'or by parsing with express.json({ verify: captureRawBody }) from @chari-pay/sdk/express.',
    ),
  );
}

export type { ChariPayEvent };
