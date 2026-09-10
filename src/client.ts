import { HttpClient, type ChariPayRequestInfo, type ChariPayResponseInfo, type ResolvedConfig } from './http.js';
import { AnalyticsResource } from './resources/analytics.js';
import { CheckoutResource } from './resources/checkout.js';
import { CheckoutSessionsResource } from './resources/checkout-sessions.js';
import { ClientsResource } from './resources/clients.js';
import { PaymentLinksResource } from './resources/payment-links.js';
import { ProductsResource } from './resources/products.js';
import { RefundsResource } from './resources/refunds.js';
import { SubscriptionsResource } from './resources/subscriptions.js';
import { TransactionsResource } from './resources/transactions.js';
import { WalletResource } from './resources/wallet.js';
import { WebhookEndpointsResource } from './resources/webhook-endpoints.js';
import { WebhookEventsResource } from './resources/webhook-events.js';
import { Webhooks } from './webhooks.js';

export const SANDBOX_BASE_URL = 'https://chari-pay-api.mobileappexpert.dev';
export const PRODUCTION_BASE_URL = 'https://api.chari.ma';

/**
 * Infers the base URL from a recognised key prefix.
 *
 * Chari Pay's server — not the key's shape — is the actual source of truth for
 * which environment a key belongs to, so this can only be sound for the two
 * prefixes it knows about: `chari_sk_test_` (sandbox) and `chari_sk_live_`
 * (production). Any other prefix throws a `TypeError` rather than guessing —
 * silently resolving to production for an unrecognised key would risk routing
 * real traffic somewhere the caller never chose.
 *
 * @throws {TypeError} if `apiKey` does not start with `chari_sk_test_` or
 *   `chari_sk_live_`. Pass `baseUrl` explicitly in that case.
 */
export function resolveBaseUrl(apiKey: string): string {
  if (apiKey.startsWith('chari_sk_test_')) return SANDBOX_BASE_URL;
  if (apiKey.startsWith('chari_sk_live_')) return PRODUCTION_BASE_URL;

  throw new TypeError(
    `ChariPay could not infer the environment from this API key. ` +
      `Only 'chari_sk_test_' (sandbox) and 'chari_sk_live_' (production) prefixes are recognised. ` +
      `Pass the base URL explicitly instead: new ChariPay({ apiKey, baseUrl: '${SANDBOX_BASE_URL}' }) ` +
      `for sandbox, or new ChariPay({ apiKey, baseUrl: '${PRODUCTION_BASE_URL}' }) for production.`,
  );
}

export interface ChariPayConfig {
  /**
   * Your secret key. For `chari_sk_test_…` / `chari_sk_live_…` keys, the
   * prefix decides sandbox vs production. Any other key format requires
   * `baseUrl` to be set explicitly — see {@link resolveBaseUrl}.
   */
  apiKey: string;
  /**
   * Overrides the inferred base URL. Useful for a local mock, and required
   * when `apiKey` isn't a recognised `chari_sk_test_…` / `chari_sk_live_…` key.
   */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 30000. */
  timeout?: number;
  /** Retries for retryable failures. Default 2. */
  maxRetries?: number;
  /** Default secret for `chari.webhooks.constructEvent`. */
  webhookSecret?: string | string[];
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
  readonly paymentLinks: PaymentLinksResource;
  readonly checkoutSessions: CheckoutSessionsResource;
  readonly checkout: CheckoutResource;
  readonly clients: ClientsResource;
  readonly products: ProductsResource;
  readonly subscriptions: SubscriptionsResource;
  readonly refunds: RefundsResource;
  readonly analytics: AnalyticsResource;
  readonly webhookEndpoints: WebhookEndpointsResource;
  readonly webhookEvents: WebhookEventsResource;
  readonly webhooks: Webhooks;

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
    this.paymentLinks = new PaymentLinksResource(this.http);
    this.checkoutSessions = new CheckoutSessionsResource(this.http);
    this.checkout = new CheckoutResource(this.http);
    this.clients = new ClientsResource(this.http);
    this.products = new ProductsResource(this.http);
    this.subscriptions = new SubscriptionsResource(this.http);
    this.refunds = new RefundsResource(this.http);
    this.analytics = new AnalyticsResource(this.http);
    this.webhookEndpoints = new WebhookEndpointsResource(this.http);
    this.webhookEvents = new WebhookEventsResource(this.http);
    this.webhooks = new Webhooks(this.config.webhookSecret);
  }

  /** True when the key resolved to the sandbox environment. */
  get isSandbox(): boolean {
    return this.config.baseUrl === SANDBOX_BASE_URL;
  }
}
