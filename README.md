# @chari-pay/sdk

Official, zero-dependency TypeScript SDK for the [Chari Pay](https://chari.ma) payment service provider — payments, links, checkout, subscriptions, refunds and verified webhooks.

## Install

```bash
npm install @chari-pay/sdk
```

Requires Node 18+ (for global `fetch`). The package has **zero runtime dependencies** — `express` and `@nestjs/common` are optional peer dependencies, only needed if you use the corresponding adapter.

## Charge in five lines

```ts
import { ChariPay } from '@chari-pay/sdk';

const chari = new ChariPay(process.env.CHARI_PAY_API_KEY!);
const link = await chari.paymentLinks.create({ amount: 149.9, description: 'Order #1234' });
console.log(link.payUrl); // send the buyer here
```

> If your key doesn't start with `chari_sk_test_` or `chari_sk_live_` (for example a
> `flex_…` sandbox key), the line above throws — pass `baseUrl` explicitly instead:
> `new ChariPay({ apiKey: process.env.CHARI_PAY_API_KEY!, baseUrl: '<your sandbox or production URL>' })`.
> See [Environments](#environments).

`amount` and `description` are both required on `paymentLinks.create` — the API rejects a request missing either.

## Environments

The client can only infer sandbox vs. production from a key whose prefix is
unambiguous. Chari Pay's server, not the key's shape, is the actual source of
truth for which environment a key belongs to, so inference is a convenience
for the two prefixes we know about — never a guess for anything else:

```ts
resolveBaseUrl(apiKey)
// 'chari_sk_test_…' → sandbox
// 'chari_sk_live_…' → production
// anything else      → throws TypeError
```

| Key prefix | Base URL |
| --- | --- |
| `chari_sk_test_…` | `https://chari-pay-api.mobileappexpert.dev` (sandbox) |
| `chari_sk_live_…` | `https://api.chari.ma` (production) |
| anything else (e.g. `flex_…`) | not inferred — construction throws unless you pass `baseUrl` |

If your key doesn't match one of the two recognised prefixes, pass `baseUrl`
explicitly — this is required, not optional, for those keys:

```ts
const chari = new ChariPay({
  apiKey: process.env.CHARI_PAY_API_KEY!,
  baseUrl: 'https://chari-pay-api.mobileappexpert.dev', // sandbox
  // baseUrl: 'https://api.chari.ma', // production
});
```

`baseUrl` also works as an override for any key, e.g. to point at a local mock:

```ts
const chari = new ChariPay({ apiKey: process.env.CHARI_PAY_API_KEY!, baseUrl: 'http://localhost:4000' });
```

Check which environment you resolved to with `chari.isSandbox`.

## Namespaces

Every operation lives under `chari.<namespace>`:

| Namespace | What it does |
| --- | --- |
| `chari.wallet` | Balance, bank coordinates (RIB/IBAN/BIC), sandbox top-ups. |
| `chari.transactions` | Money movements: payments, refunds, transfers, timelines, CSV export. |
| `chari.paymentLinks` | Reusable or single-use links to a hosted payment page (QR, poster). |
| `chari.checkoutSessions` | Server-created payment sessions for the hosted checkout page. |
| `chari.checkout` | The direct-API checkout — pay a session server-to-server, no hosted page. |
| `chari.clients` | Saved buyers and the payment methods stored with them. |
| `chari.products` | A catalogue of sellable items, each with its own orders. |
| `chari.subscriptions` | Recurring billing; each period generates a charge. |
| `chari.refunds` | Full or partial refunds of a successful payment. |
| `chari.analytics` | Buyer-journey summaries and events for links, sessions, subscriptions. |
| `chari.webhookEndpoints` | Manage the URLs Chari Pay delivers events to, and rotate their secrets. |
| `chari.webhookEvents` | The delivery log: what Chari Pay sent you, and how it went. |
| `chari.webhooks` | Verify and parse an incoming delivery (`constructEvent`), bound to your `webhookSecret`. |

## Errors

Every failure is a subclass of `ChariPayError`, chosen by HTTP status:

| Class | When |
| --- | --- |
| `ChariPayAuthenticationError` | 401 — the API key is missing, malformed, or revoked. |
| `ChariPayPermissionError` | 403 — authenticated, but not allowed (including production not enabled). |
| `ChariPayValidationError` | 400 / 422 — rejected by validation or a business rule; has a `field`. |
| `ChariPayRateLimitError` | 429 — rate limited; has `retryAfter` in seconds. |
| `ChariPayConnectionError` | No HTTP response at all: DNS, socket, or timeout. |
| `ChariPayAPIError` | 5xx, or anything the SDK cannot classify more precisely. |

Every error carries `correlationId` — the value Chari Pay support asks for first:

```ts
import { ChariPayError } from '@chari-pay/sdk';

try {
  await chari.paymentLinks.create({ amount: 100, description: 'Order #1' });
} catch (error) {
  if (error instanceof ChariPayError) {
    console.error(`${error.code}: ${error.message} (correlationId=${error.correlationId})`);
  }
  throw error;
}
```

## Idempotency

Every `create*` call sends an auto-generated `Idempotency-Key`, so a retried call after a timeout replays the original result instead of creating a duplicate. Pass your own key to control replay yourself:

```ts
await chari.paymentLinks.create(
  { amount: 149.9, description: 'Order #1234' },
  { idempotencyKey: 'order-1234-attempt-1' },
);
```

Calling with the same key again returns the first result rather than making a second charge.

## Pagination

`list()` returns a `PagePromise`: `await` it for one page, `for await` it for everything.

```ts
const page = await chari.transactions.list();      // one page
console.log(page.content, page.totalPages);

for await (const tx of chari.transactions.list()) { // every page, transparently
  console.log(tx.reference, tx.status);
}

// Collect up to a bound, so you never accidentally pull a year of history into memory.
const recent = await chari.transactions.list().autoPagingToArray({ limit: 500 });
```

## Metadata

Every `metadata` parameter and response field accepts/returns `ChariPayMetadata`, a flat `Record<string, string | number | boolean | null>` — scalars only, matching the API's own "opaque identifiers" guidance and its 4 KB serialized limit:

```ts
await chari.paymentLinks.create({
  amount: 149.9,
  description: 'Order #1234',
  metadata: { orderId: 'A-1', verified: true },
});
```

## Files

QR codes, in-store posters, RIB documents and CSV exports come back as a `ChariPayFile`:

```ts
const qr = await chari.paymentLinks.qr(link.reference);
qr.contentType; // 'image/png'
qr.data;         // Buffer

// Stream straight into an HTTP response.
app.get('/links/:ref/qr', async (req, res) => {
  const file = await chari.paymentLinks.qr(req.params.ref);
  res.type(file.contentType);
  file.toStream().pipe(res);
});
```

The same shape covers `paymentLinks.poster`, `wallet.ribDocument` and `transactions.exportCsv`.

## Webhooks

`chari.webhooks.constructEvent(rawBody, headers)` verifies the HMAC signature and returns a typed event in one call. **The raw, untouched request bytes must reach it** — re-serialising a parsed JSON body changes the signature and verification will fail.

`ChariPayEvent` is a 21-member union keyed on `type`, so narrowing works with no extra check:

```ts
if (event.type === 'payment.succeeded') {
  event.data.amount; // number | undefined — no `event.known` check needed
}
```

**Important caveat:** `ChariPayEvent`'s `type` is typed as one of the 21 known names, but Chari Pay can send an event type this SDK doesn't know about yet (added after the SDK shipped). `constructEvent`/`parseEvent` never throw for an unrecognised type — the delivery still arrives, just typed as if it were one of the 21. Always keep a `default`/`else` branch in your handling, and **do not** rely on exhaustiveness checking (`const _exhaustive: never = event.type`) to catch a missing case — it will compile even though a real, unhandled event can still show up at runtime. If you need a sound check instead of the ergonomic approximation, use `isKnownEventType(event.type)` or narrow with `ChariPayUnknownEvent`:

```ts
import { isKnownEventType, type ChariPayUnknownEvent } from '@chari-pay/sdk';

const event = chari.webhooks.constructEvent(rawBody, headers);
if (isKnownEventType(event.type)) {
  // event.type: ChariPayEventType, verified against CHARI_PAY_EVENT_TYPES
} else {
  const unknown: ChariPayUnknownEvent = event;
  console.warn('unrecognised event type', unknown.type);
}
```

### Express

Mount `chariPayWebhook()` **before** `express.json()`, or use `express.json({ verify: captureRawBody })` if a global JSON parser already runs first. Both work; nothing else can, because once the raw bytes are gone they cannot be reconstructed from the parsed body — the middleware refuses rather than guess.

```ts
import express from 'express';
import { ChariPay } from '@chari-pay/sdk';
import { chariPayWebhook, captureRawBody } from '@chari-pay/sdk/express';

const chari = new ChariPay(process.env.CHARI_PAY_API_KEY!);
const app = express();

// Option A: mount the webhook route before express.json() runs at all.
app.post(
  '/webhooks/chari-pay',
  chariPayWebhook({ secret: process.env.CHARI_PAY_WEBHOOK_SECRET! }),
  (req, res) => {
    if (req.chariPayEvent.type === 'payment.succeeded') {
      console.log('paid:', req.chariPayEvent.data.reference, req.chariPayEvent.data.amount);
    }
    res.sendStatus(200);
  },
);

// Option B: if express.json() must run globally first, capture the raw bytes.
app.use(express.json({ verify: captureRawBody }));
```

### NestJS

`ChariPayModule.forRoot()` registers a configured `ChariPay` client plus the webhook guard. **The app must be created with `rawBody: true`** — without it the guard refuses every request, because there is no raw body to check the signature against:

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true }); // required
  await app.listen(3000);
}
void bootstrap();
```

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ChariPayModule } from '@chari-pay/sdk/nestjs';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [
    ChariPayModule.forRoot({
      apiKey: process.env.CHARI_PAY_API_KEY!,
      webhookSecret: process.env.CHARI_PAY_WEBHOOK_SECRET!,
    }),
  ],
  controllers: [WebhooksController],
})
export class AppModule {}
```

```ts
// webhooks.controller.ts
import { Controller, HttpCode, Post } from '@nestjs/common';
import { ChariPay } from '@chari-pay/sdk';
import { ChariPayEventPayload, ChariPayWebhook, type ChariPayEvent } from '@chari-pay/sdk/nestjs';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly chari: ChariPay) {}

  @Post('chari-pay')
  @HttpCode(200)
  @ChariPayWebhook()
  async handle(@ChariPayEventPayload() event: ChariPayEvent) {
    if (event.type === 'payment.succeeded') {
      const tx = await this.chari.transactions.retrieve(String(event.data.operationId));
      console.log('settled', tx.status);
    }
    return { received: true };
  }
}
```

### Any other framework

Use `verifyWebhookSignature` and `parseEvent` from `@chari-pay/sdk/webhooks` directly, as long as you can get the untouched raw body. Next.js's App Router is a good example — `request.text()` hands back the raw bytes before any framework parsing:

```ts
import { verifyWebhookSignature, parseEvent } from '@chari-pay/sdk/webhooks';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  try {
    verifyWebhookSignature({ rawBody, headers, secret: process.env.CHARI_PAY_WEBHOOK_SECRET! });
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  const event = parseEvent(rawBody, headers);
  if (event.type === 'payment.succeeded') {
    // fulfil the order
  }
  return Response.json({ received: true });
}
```

## Direct-API checkout

`chari.checkout.verify`, `.submit`, `.confirmReturn` and `.paymentStatus` — the four operations under `/checkout/*` — talk to the API server-to-server, without the hosted payment page.

> **These four calls send no API key.** `api-1.yaml` declares them public (`security: []`) and their descriptions say not to send `X-CHARI-PAY-API-KEY` at all; the SDK omits the auth header automatically for them. Because you are handling raw card data yourself, using this path puts **you** in PCI DSS scope — prefer a hosted payment link or the hosted checkout session page unless you are certain you need direct submission.
>
> **`ChariPay` still requires an `apiKey`, even for a checkout-only integration.** The constructor rejects a missing or empty key regardless of which operations you end up calling — `apiKey` stays mandatory for 1.0 (see `docs/design.md`). If your integration only ever calls the four `/checkout/*` operations above, the key is never transmitted on the wire, so you may construct the client with any non-empty placeholder (e.g. `new ChariPay({ apiKey: 'unused-checkout-only-key' })`) instead of a real secret key.

```ts
// sessionId and vk both come from chari.checkoutSessions.create(...).
const session = await chari.checkout.verify({ sessionId: 'ps_5Kd0Rn', vk: 'session-verification-key' });

const result = await chari.checkout.submit({
  sessionId: session.sessionId!,
  card: { firstName: 'Amine', lastName: 'Bennani', pan: '4111111111111111', expiryDate: '09/27', cvv: '123' },
});

if (result.status === 'PENDING_3DS') {
  // redirect the buyer to result.redirectionUrl, then after they return:
  await chari.checkout.confirmReturn({ sessionId: session.sessionId!, operationId: result.operationId! });
}
```

## Debugging

Set `CHARI_DEBUG=1` (or pass `debug: true` to the constructor) to log every request and response to stderr — credentials are always redacted, never printed in the clear.

For structured tracing, use the request/response hooks instead:

```ts
const chari = new ChariPay({
  apiKey: process.env.CHARI_PAY_API_KEY!,
  onRequest: (info) => logger.debug('chari-pay request', info),
  onResponse: (info) => logger.debug('chari-pay response', info),
});
```

## Going to production

1. Swap `CHARI_PAY_API_KEY` for a production key. If it's a `chari_sk_live_…` key,
   the base URL follows automatically; for any other key format, set `baseUrl`
   explicitly to `https://api.chari.ma` (see [Environments](#environments)).
2. Re-register your webhook endpoints against production with `chari.webhookEndpoints.create(...)`; sandbox and production endpoints and secrets are independent.
3. Rotate a webhook secret with `chari.webhookEndpoints.rotateSecret(id)` when you need to. During rotation Chari Pay signs every delivery with **both** the old and new secrets, so keep verifying against either until you've finished deploying the new one everywhere.

## Types

All request/response types are generated from `api-1.yaml` via `openapi-typescript` (`npm run codegen`). A handful of types — mostly wallet and transaction response shapes the spec doesn't define — are hand-modelled instead; their doc comments are marked `Not defined in api-1.yaml`. Treat those as a best reading of the endpoint description, not a contract, and expect them to tighten as Chari Pay publishes real schemas.

## Migrating from a hand-rolled client

Already calling the API through a hand-rolled wrapper, like the `example_psp` tester app's `ChariPayClientService`? See [MIGRATION.md](./MIGRATION.md) for before/after call pairs across every domain.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the codegen workflow, the rule against hand-editing `src/generated/`, and how hand-modelled types are documented.
