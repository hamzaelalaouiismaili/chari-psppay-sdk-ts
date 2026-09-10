import { randomUUID } from 'node:crypto';
import { ChariPayConnectionError, errorFromResponse } from './errors.js';
import { makeFile, parseFilename, type ChariPayFile } from './file.js';

/** Options every resource method accepts as its final argument. */
export interface RequestOptions {
  /** Overrides the auto-generated key on creates. Replays return the first result. */
  idempotencyKey?: string;
  /** Sent as `X-Request-Id`; Chari Pay echoes it back as `correlationId`. */
  requestId?: string;
  /** Per-call timeout in ms. Defaults to the client's `timeout`. */
  timeout?: number;
  /** Per-call retry budget. Defaults to the client's `maxRetries`. */
  maxRetries?: number;
  /** Caller-controlled cancellation. */
  signal?: AbortSignal;
}

export interface ChariPayRequestInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  attempt: number;
}

export interface ChariPayResponseInfo {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  correlationId?: string;
  attempt: number;
}

/** Fully-defaulted configuration; produced by `ChariPay` in client.ts. */
export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
  debug: boolean;
  webhookSecret?: string | string[];
  onRequest?: (info: ChariPayRequestInfo) => void;
  onResponse?: (info: ChariPayResponseInfo) => void;
}

export interface InternalRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Absolute path, e.g. `/v1/payment-links`. Resources own their prefix. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /** True for the four `/checkout/*` operations, which must not carry the key. */
  isPublic?: boolean;
  /** Generate an Idempotency-Key when the caller did not supply one. */
  autoIdempotency?: boolean;
  options?: RequestOptions;
}

const REDACTED = '***redacted***';

/** The single place auth, headers, and error translation happen. */
export class HttpClient {
  constructor(private readonly cfg: ResolvedConfig) {}

  async request<T>(req: InternalRequest): Promise<T> {
    const { response, url, startedAt, attempt } = await this.send(req);
    return (await this.parse<T>(req, response, url, startedAt, attempt)) as T;
  }

  /** Builds the absolute URL, dropping `undefined` query values. */
  protected buildUrl(req: InternalRequest): string {
    const path = req.path.startsWith('/') ? req.path : `/${req.path}`;
    const url = new URL(this.cfg.baseUrl.replace(/\/$/, '') + path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.append(key, String(value));
    }
    return url.toString();
  }

  protected buildHeaders(req: InternalRequest): Record<string, string> {
    const headers: Record<string, string> = { Accept: '*/*' };

    // The four public /checkout/* operations are documented `security: []` and
    // explicitly reject a key, so this branch is load-bearing.
    if (!req.isPublic) headers['X-CHARI-PAY-API-KEY'] = this.cfg.apiKey;

    if (req.body !== undefined) headers['Content-Type'] = 'application/json';

    // Resolved once per request in `send()`, so a retry replays the same key.
    if (req.options?.idempotencyKey) headers['Idempotency-Key'] = req.options.idempotencyKey;

    if (req.options?.requestId) headers['X-Request-Id'] = req.options.requestId;
    return headers;
  }

  /** Runs one request, retrying only when doing so is provably safe. */
  protected async send(req: InternalRequest) {
    // Mint the key BEFORE the first attempt so every retry replays it.
    if (req.autoIdempotency && !req.options?.idempotencyKey) {
      req.options = { ...req.options, idempotencyKey: randomUUID() };
    }

    const maxRetries = req.options?.maxRetries ?? this.cfg.maxRetries;
    const retryable = this.isRetryableRequest(req);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await this.attempt(req, attempt);
        if (result.response.ok || !retryable || !isRetryable(result.response.status) || attempt > maxRetries) {
          return result;
        }
        // We are discarding this response in favour of a retry: consume its
        // body so the underlying connection (undici keeps a socket open
        // until the body is read or explicitly cancelled) is freed.
        await drainResponse(result.response);
        await sleep(backoffMs(attempt, retryAfterSeconds(result.response)));
        continue;
      } catch (err) {
        lastError = err;
        const isConnection = err instanceof ChariPayConnectionError;
        if (!isConnection || !retryable || attempt > maxRetries) throw err;
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError;
  }

  /**
   * GET/PUT/DELETE are idempotent by definition; a POST/PATCH is only safe to
   * replay when it carries an Idempotency-Key, which every `create*` does.
   */
  private isRetryableRequest(req: InternalRequest): boolean {
    if (req.method === 'GET' || req.method === 'PUT' || req.method === 'DELETE') return true;
    return Boolean(req.options?.idempotencyKey);
  }

  protected async attempt(req: InternalRequest, attempt: number) {
    const url = this.buildUrl(req);
    const headers = this.buildHeaders(req);
    const startedAt = Date.now();

    this.cfg.onRequest?.({
      method: req.method,
      url,
      headers: redact(headers),
      body: redactBody(req.body),
      attempt,
    });
    if (this.cfg.debug) {
      // eslint-disable-next-line no-console
      console.error(`[chari-pay] → ${req.method} ${url} (attempt ${attempt})`);
    }

    const timeout = req.options?.timeout ?? this.cfg.timeout;
    const callerSignal = req.options?.signal;

    // A signal the caller already aborted before we even started must be
    // honoured immediately — otherwise the `abort` event, which only fires
    // on the 0→1 transition, never reaches our listener and the request
    // goes out anyway.
    if (callerSignal?.aborted) {
      throw new ChariPayConnectionError(`Request to ${url} was aborted before it was sent.`, callerSignal.reason);
    }

    const controller = new AbortController();
    let timedOut = false;
    let userAborted = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = () => {
      userAborted = true;
      controller.abort();
    };
    callerSignal?.addEventListener('abort', onAbort);

    let response: Response;
    try {
      response = await this.cfg.fetch(url, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
    } catch (cause) {
      const aborted = (cause as Error)?.name === 'AbortError';
      let message: string;
      if (userAborted) {
        // Distinguish a caller-initiated cancellation from a timeout — both
        // surface as an AbortError from fetch, but they mean very different
        // things to whoever is reading the error message.
        message = `Request to ${url} was aborted by the caller.`;
      } else if (aborted && timedOut) {
        message = `Request to ${url} timed out after ${timeout}ms`;
      } else if (aborted) {
        message = `Request to ${url} was aborted.`;
      } else {
        message = `Could not reach Chari Pay at ${url}: ${(cause as Error)?.message ?? cause}`;
      }
      throw new ChariPayConnectionError(message, cause);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onAbort);
    }

    return { response, url, startedAt, attempt };
  }

  protected async parse<T>(
    req: InternalRequest,
    response: Response,
    url: string,
    startedAt: number,
    attempt: number,
  ): Promise<T | undefined> {
    const body = await readBody(response);
    const rawCorrelationId =
      body && typeof body === 'object' ? (body as { correlationId?: string }).correlationId : undefined;
    const correlationId = rawCorrelationId || undefined;

    this.cfg.onResponse?.({
      method: req.method,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      correlationId,
      attempt,
    });
    if (this.cfg.debug) {
      // eslint-disable-next-line no-console
      console.error(
        `[chari-pay] ← ${req.method} ${url} ${response.status} ${Date.now() - startedAt}ms` +
          (correlationId ? ` correlationId=${correlationId}` : ''),
      );
    }

    if (!response.ok) {
      throw errorFromResponse(response.status, body, req.options?.requestId, retryAfterSeconds(response));
    }
    return body as T | undefined;
  }

  /**
   * Fetches a binary document. Errors still arrive as JSON, so a failure is
   * decoded and thrown through the same typed hierarchy as everything else.
   */
  async requestBinary(req: InternalRequest): Promise<ChariPayFile> {
    const { response, url, startedAt, attempt } = await this.send(req);
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      let body: unknown = buffer.toString('utf8').slice(0, 2000);
      try {
        body = JSON.parse(body as string);
      } catch {
        /* keep the truncated text */
      }
      this.cfg.onResponse?.({
        method: req.method, url, status: response.status,
        durationMs: Date.now() - startedAt, attempt,
      });
      throw errorFromResponse(response.status, body, req.options?.requestId, retryAfterSeconds(response));
    }

    this.cfg.onResponse?.({
      method: req.method, url, status: response.status,
      durationMs: Date.now() - startedAt, attempt,
    });

    return makeFile(
      buffer,
      response.headers.get('content-type') ?? 'application/octet-stream',
      parseFilename(response.headers.get('content-disposition')),
    );
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

/** 429 and 5xx are worth another go; every other status is a decision. */
export function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Exponential backoff with full jitter, capped. A `Retry-After` from the
 * server always wins — it knows more than we do.
 */
export function backoffMs(attempt: number, retryAfter?: number): number {
  if (retryAfter !== undefined) return Math.min(retryAfter * 1000, BACKOFF_CAP_MS * 4);
  const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return Math.max(1, Math.round(Math.random() * ceiling));
}

/**
 * Consumes a response body we are about to discard (in favour of a retry)
 * so the connection can be released back to the pool instead of held open.
 * Best-effort: a body that fails to drain does not stop the retry.
 */
async function drainResponse(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    /* the response is being discarded anyway */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Never let a key reach a log sink, even a user-supplied one. */
function redact(headers: Record<string, string>): Record<string, string> {
  const clone = { ...headers };
  for (const key of Object.keys(clone)) {
    const k = key.toLowerCase();
    if (k.includes('api-key') || k === 'authorization' || k.includes('secret')) clone[key] = REDACTED;
  }
  return clone;
}

/**
 * Field names (matched case-insensitively) whose value is unconditionally
 * redacted before a request body ever reaches `onRequest`. `chari.checkout.submit`
 * carries a raw card number and CVV in this shape — see docs/design.md §10:
 * "API keys, PAN, and CVV redacted unconditionally".
 */
const SENSITIVE_BODY_FIELD_PATTERNS = [
  /^pan$/i,
  /^number$/i,
  /^cardnumber$/i,
  /^cvv$/i,
  /^cvc$/i,
  /^securitycode$/i,
  /^expirydate$/i,
  /^expiry$/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /password/i,
  /token/i,
];

function isSensitiveBodyField(key: string): boolean {
  return SENSITIVE_BODY_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts sensitive fields from a request body before it is
 * handed to `onRequest`. Never mutates `value` — always returns a fresh
 * structure (or the original primitive, which is immutable anyway).
 */
export function redactBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactBody(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveBodyField(key) ? REDACTED : redactBody(val);
    }
    return out;
  }
  return value;
}
