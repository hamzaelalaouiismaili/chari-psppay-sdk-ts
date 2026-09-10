import { HttpClient, type ChariPayRequestInfo, type ChariPayResponseInfo, type ResolvedConfig } from './http.js';
import { TransactionsResource } from './resources/transactions.js';
import { WalletResource } from './resources/wallet.js';

export const SANDBOX_BASE_URL = 'https://chari-pay-api.mobileappexpert.dev';
export const PRODUCTION_BASE_URL = 'https://api.chari.ma';

/** Sandbox keys are prefixed; everything else is production. */
export function resolveBaseUrl(apiKey: string): string {
  return apiKey.startsWith('chari_sk_test_') ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

export interface ChariPayConfig {
  /** Your secret key. The prefix decides sandbox vs production. */
  apiKey: string;
  /** Overrides the inferred base URL. Useful for a local mock. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 30000. */
  timeout?: number;
  /** Retries for retryable failures. Default 2. */
  maxRetries?: number;
  /** Default secret for `chari.webhooks.constructEvent`. */
  webhookSecret?: string;
  /** Custom fetch, for tests, proxies, or tracing. */
  fetch?: typeof fetch;
  /** Log requests and responses to stderr, credentials redacted. */
  debug?: boolean;
  onRequest?: (info: ChariPayRequestInfo) => void;
  onResponse?: (info: ChariPayResponseInfo) => void;
}

/**
 * The Chari Pay client.
 *
 * ```ts
 * const chari = new ChariPay(process.env.CHARI_PAY_API_KEY!);
 * const link = await chari.paymentLinks.create({ amount: 149.9, description: 'Order #1234' });
 * ```
 */
export class ChariPay {
  readonly config: ResolvedConfig;
  protected readonly http: HttpClient;

  readonly wallet: WalletResource;
  readonly transactions: TransactionsResource;

  constructor(config: ChariPayConfig | string) {
    const input: ChariPayConfig = typeof config === 'string' ? { apiKey: config } : config ?? ({} as ChariPayConfig);

    if (!input.apiKey || typeof input.apiKey !== 'string') {
      throw new TypeError(
        'ChariPay requires an `apiKey`. Pass it directly — new ChariPay(process.env.CHARI_PAY_API_KEY!).',
      );
    }

    this.config = {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl ?? resolveBaseUrl(input.apiKey),
      timeout: input.timeout ?? 30000,
      maxRetries: input.maxRetries ?? 2,
      fetch: input.fetch ?? globalThis.fetch,
      debug: input.debug ?? process.env.CHARI_DEBUG === '1',
      webhookSecret: input.webhookSecret,
      onRequest: input.onRequest,
      onResponse: input.onResponse,
    };

    if (typeof this.config.fetch !== 'function') {
      throw new TypeError('No global fetch found. Use Node 18+, or pass a `fetch` implementation.');
    }

    this.http = new HttpClient(this.config);
    this.wallet = new WalletResource(this.http);
    this.transactions = new TransactionsResource(this.http);
  }

  /** True when the key resolved to the sandbox environment. */
  get isSandbox(): boolean {
    return this.config.baseUrl === SANDBOX_BASE_URL;
  }
}
