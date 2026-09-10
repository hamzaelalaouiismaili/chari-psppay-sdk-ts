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
