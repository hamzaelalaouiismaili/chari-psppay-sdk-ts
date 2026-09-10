/** Chari Pay's canonical error envelope. */
interface ErrorEnvelope {
  error?: { code?: string; message?: string; field?: string };
  correlationId?: string;
}

/**
 * Base class for every error the SDK throws.
 *
 * `correlationId` is the value Chari Pay support asks for first, so it is part
 * of the printed form as well as the object.
 */
export class ChariPayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly raw: unknown;

  constructor(args: {
    message: string;
    status: number;
    code: string;
    correlationId?: string;
    requestId?: string;
    raw?: unknown;
  }) {
    super(args.message);
    this.name = new.target.name;
    this.status = args.status;
    this.code = args.code;
    this.correlationId = args.correlationId;
    this.requestId = args.requestId;
    this.raw = args.raw;
    Error.captureStackTrace?.(this, new.target);
  }

  override toString(): string {
    const parts = [`${this.name}: [${this.code}] ${this.message}`];
    if (this.status) parts.push(`(HTTP ${this.status})`);
    if (this.correlationId) parts.push(`correlationId=${this.correlationId}`);
    return parts.join(' ');
  }
}

/** 401 — the API key is missing, malformed, or revoked. */
export class ChariPayAuthenticationError extends ChariPayError {}

/** 403 — authenticated, but not allowed (including production not enabled). */
export class ChariPayPermissionError extends ChariPayError {}

/** 400 / 422 — the request was rejected by validation or a business rule. */
export class ChariPayValidationError extends ChariPayError {
  readonly field?: string;
  constructor(args: ConstructorParameters<typeof ChariPayError>[0] & { field?: string }) {
    super(args);
    this.field = args.field;
  }
}

/** 429 — rate limited. `retryAfter` is in seconds, from the Retry-After header. */
export class ChariPayRateLimitError extends ChariPayError {
  readonly retryAfter?: number;
  constructor(args: ConstructorParameters<typeof ChariPayError>[0] & { retryAfter?: number }) {
    super(args);
    this.retryAfter = args.retryAfter;
  }
}

/** The request never produced an HTTP response: DNS, socket, or timeout. */
export class ChariPayConnectionError extends ChariPayError {
  constructor(message: string, cause?: unknown) {
    super({ message, status: 0, code: 'CONNECTION_ERROR', raw: cause });
  }
}

/** 5xx and anything the SDK cannot classify more precisely. */
export class ChariPayAPIError extends ChariPayError {}

/** Raised when a webhook signature cannot be verified. */
export class ChariPaySignatureVerificationError extends ChariPayError {
  constructor(message: string) {
    super({ message, status: 400, code: 'INVALID_SIGNATURE' });
  }
}

/** Raised when an adapter is mounted in a way that cannot work. */
export class ChariPayWebhookSetupError extends ChariPayError {
  constructor(message: string) {
    super({ message, status: 500, code: 'WEBHOOK_SETUP_ERROR' });
  }
}

function readEnvelope(body: unknown): {
  code?: string;
  message?: string;
  field?: string;
  correlationId?: string;
} {
  if (!body || typeof body !== 'object') return {};
  const env = body as ErrorEnvelope;
  return {
    code: env.error?.code,
    message: env.error?.message,
    field: env.error?.field,
    correlationId: env.correlationId,
  };
}

/** Turns an HTTP failure into the most specific error class that fits. */
export function errorFromResponse(
  status: number,
  body: unknown,
  requestId?: string,
  retryAfter?: number,
): ChariPayError {
  const { code, message, field, correlationId } = readEnvelope(body);
  const base = {
    message: message ?? `Chari Pay returned HTTP ${status}`,
    status,
    code: code ?? (status >= 500 ? 'UPSTREAM_ERROR' : 'API_ERROR'),
    correlationId,
    requestId,
    raw: body,
  };

  if (status === 401) return new ChariPayAuthenticationError(base);
  if (status === 403) return new ChariPayPermissionError(base);
  if (status === 400 || status === 422) return new ChariPayValidationError({ ...base, field });
  if (status === 429) return new ChariPayRateLimitError({ ...base, retryAfter });
  return new ChariPayAPIError(base);
}
