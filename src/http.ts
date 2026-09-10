import { randomUUID } from 'node:crypto';
import { ChariPayConnectionError, ChariPayError, errorFromResponse } from './errors.js';

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
  webhookSecret?: string;
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

    const idempotencyKey =
      req.options?.idempotencyKey ?? (req.autoIdempotency ? randomUUID() : undefined);
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    if (req.options?.requestId) headers['X-Request-Id'] = req.options.requestId;
    return headers;
  }

  /** One attempt. Task 4 overrides this to add retries. */
  protected async send(req: InternalRequest): Promise<{
    response: Response;
    url: string;
    startedAt: number;
    attempt: number;
  }> {
    return this.attempt(req, 1);
  }

  protected async attempt(req: InternalRequest, attempt: number) {
    const url = this.buildUrl(req);
    const headers = this.buildHeaders(req);
    const startedAt = Date.now();

    this.cfg.onRequest?.({ method: req.method, url, headers: redact(headers), body: req.body, attempt });
    if (this.cfg.debug) {
      // eslint-disable-next-line no-console
      console.error(`[chari-pay] → ${req.method} ${url} (attempt ${attempt})`);
    }

    const timeout = req.options?.timeout ?? this.cfg.timeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const onAbort = () => controller.abort();
    req.options?.signal?.addEventListener('abort', onAbort);

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
      throw new ChariPayConnectionError(
        aborted
          ? `Request to ${url} timed out after ${timeout}ms`
          : `Could not reach Chari Pay at ${url}: ${(cause as Error)?.message ?? cause}`,
        cause,
      );
    } finally {
      clearTimeout(timer);
      req.options?.signal?.removeEventListener('abort', onAbort);
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

/** Never let a key reach a log sink, even a user-supplied one. */
function redact(headers: Record<string, string>): Record<string, string> {
  const clone = { ...headers };
  for (const key of Object.keys(clone)) {
    const k = key.toLowerCase();
    if (k.includes('api-key') || k === 'authorization' || k.includes('secret')) clone[key] = REDACTED;
  }
  return clone;
}
