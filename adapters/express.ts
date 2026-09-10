import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ChariPaySignatureVerificationError, ChariPayWebhookSetupError } from '../src/errors.js';
import { parseEvent, verifyWebhookSignature } from '../src/webhooks.js';
import type { ChariPayEvent } from '../src/types/events.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The verified, typed webhook event. Set by `chariPayWebhook()`. */
    chariPayEvent: ChariPayEvent;
    /** Untouched request bytes, when a body parser preserved them. */
    rawBody?: Buffer;
  }
}

export interface ChariPayWebhookOptions {
  /** The endpoint's signing secret. Never hard-code it — read it from the environment. */
  secret: string;
  /** Timestamp drift allowed, in ms. Default 300000. */
  toleranceMs?: number;
  /** Replaces the default `400` response on a verification failure. */
  onError?: (error: Error, req: Request, res: Response) => void;
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
  if (!options?.secret) {
    throw new ChariPayWebhookSetupError('chariPayWebhook requires a `secret`.');
  }

  return function chariPayWebhookMiddleware(req: Request, res: Response, next: NextFunction): void {
    readRawBody(req)
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
        // A setup problem is the developer's bug, not a bad delivery: surface it.
        if (options.onError) return options.onError(error, req, res);
        next(error);
      });
  };
}

/** Recovers the untouched bytes, or explains precisely why it cannot. */
function readRawBody(req: Request): Promise<Buffer> {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);

  if (req.readable && !req.complete) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
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
