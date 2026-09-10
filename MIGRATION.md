# Migrating from a hand-rolled `ChariPayClientService`

The `example_psp` NestJS tester app talks to Chari Pay through a thin
`ChariPayClientService` wrapper — each domain service builds its own path,
query params, and idempotency handling by hand. `@chari-pay/sdk` replaces
that wrapper with typed, paginated, retrying methods. This page walks through
each domain and shows the collapse.

In every case the SDK call is a drop-in replacement for the `this.chariPay.*`
call: same HTTP request, same response body, now typed and with pagination,
retries, and idempotency handled for you.

## Setup

```ts
// before (example_psp/src/chari-pay/chari-pay-client.service.ts)
// a hand-rolled fetch/axios wrapper: base URL selection, auth header,
// retry loop, and idempotency-key plumbing, all written and tested in-house.

// after
import { ChariPay } from '@chari-pay/sdk';
const chari = new ChariPay(process.env.CHARI_PAY_API_KEY!);
// base URL, retries, and idempotency keys are handled internally.
```

## Wallet

```ts
// before (example_psp/src/wallet/wallet.service.ts)
return this.chariPay.get('/v1/wallet');
return this.chariPay.get('/v1/wallet/account');
return this.chariPay.getBinary('/v1/wallet/account/rib-document');
return this.chariPay.post('/v1/wallet/cash-ins', dto, { idempotencyKey });

// after
return this.chari.wallet.balance();
return this.chari.wallet.account();
return this.chari.wallet.ribDocument();
return this.chari.wallet.cashIn(dto, { idempotencyKey });
```

## Transactions

```ts
// before (example_psp/src/transactions/transactions.service.ts)
const params: Record<string, unknown> = { page: query.page ?? 0, size: query.size ?? 20 };
if (query.sort) params.sort = query.sort;
for (const key of ['status', 'type', 'method', 'channel', 'settlementId', 'search', 'from', 'to', 'cursor', 'limit'] as const) {
  if (query[key] !== undefined) params[key] = query[key];
}
return this.chariPay.get('/v1/transactions', { params });
return this.chariPay.get(`/v1/transactions/${operationId}`);
return this.chariPay.get(`/v1/transactions/${operationId}/timeline`);
return this.chariPay.getBinary('/v1/transactions/export.csv', { params });

// after
return this.chari.transactions.list(query);
return this.chari.transactions.retrieve(operationId);
return this.chari.transactions.timeline(operationId);
return this.chari.transactions.exportCsv(query);
```

The manual param-forwarding loop — hand-picking which query keys are
defined and building the `params` object field by field — disappears
entirely; `list()` and `exportCsv()` accept the same query shape directly and
also give you an async iterator to walk every page (`for await (const tx of
chari.transactions.list())`) instead of paging by hand.

## Payment links

```ts
// before (example_psp/src/payment-links/payment-links.service.ts)
return this.chariPay.post('/v1/payment-links', dto, { idempotencyKey });
return this.chariPay.get('/v1/payment-links', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/payment-links/${reference}`);
return this.chariPay.post(`/v1/payment-links/${reference}/cancel`);
return this.chariPay.post(`/v1/payment-links/${reference}/send`, dto);
return this.chariPay.getBinary(`/v1/payment-links/${reference}/qr`);
return this.chariPay.getBinary(`/v1/payment-links/${reference}/poster`);

// after
return this.chari.paymentLinks.create(dto, { idempotencyKey });
return this.chari.paymentLinks.list(query);
return this.chari.paymentLinks.retrieve(reference);
return this.chari.paymentLinks.cancel(reference);
return this.chari.paymentLinks.send(reference, dto);
return this.chari.paymentLinks.qr(reference);
return this.chari.paymentLinks.poster(reference);
```

`toPageableParams(query)` — the tester app's helper that maps its own query
DTO onto Spring's `page`/`size`/`sort` — is no longer needed; `list()` takes
the query object as-is.

## Checkout sessions

```ts
// before (example_psp/src/checkout-sessions/checkout-sessions.service.ts)
return this.chariPay.post('/v1/payment-sessions', dto, { idempotencyKey });
return this.chariPay.get('/v1/payment-sessions', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/payment-sessions/${sessionId}`);
return this.chariPay.post(`/v1/payment-sessions/${sessionId}/cancel`);

// after
return this.chari.checkoutSessions.create(dto, { idempotencyKey });
return this.chari.checkoutSessions.list(query);
return this.chari.checkoutSessions.retrieve(sessionId);
return this.chari.checkoutSessions.cancel(sessionId);
```

## Clients

```ts
// before (example_psp/src/clients/clients.service.ts)
return this.chariPay.post('/v1/clients', dto);
return this.chariPay.get('/v1/clients', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/clients/${id}`);
return this.chariPay.put(`/v1/clients/${id}`, dto);
return this.chariPay.delete(`/v1/clients/${id}`);
return this.chariPay.get(`/v1/clients/${id}/payment-methods`);
return this.chariPay.post(`/v1/clients/${id}/payment-methods/${paymentMethodId}/default`);
return this.chariPay.delete(`/v1/clients/${id}/payment-methods/${paymentMethodId}`);

// after
return this.chari.clients.create(dto);
return this.chari.clients.list(query);
return this.chari.clients.retrieve(id);
return this.chari.clients.update(id, dto);
return this.chari.clients.del(id);
return this.chari.clients.listPaymentMethods(id);
return this.chari.clients.setDefaultPaymentMethod(id, paymentMethodId);
return this.chari.clients.deletePaymentMethod(id, paymentMethodId);
```

## Products

```ts
// before (example_psp/src/products/products.service.ts)
return this.chariPay.post('/v1/products', dto);
return this.chariPay.get('/v1/products', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/products/${reference}`);
return this.chariPay.patch(`/v1/products/${reference}`, dto);
return this.chariPay.delete(`/v1/products/${reference}`);
return this.chariPay.get(`/v1/products/${reference}/orders`, { params: toPageableParams(query) });

// after
return this.chari.products.create(dto);
return this.chari.products.list(query);
return this.chari.products.retrieve(reference);
return this.chari.products.update(reference, dto);
return this.chari.products.deactivate(reference);
return this.chari.products.orders(reference, query);
```

## Subscriptions

```ts
// before (example_psp/src/subscriptions/subscriptions.service.ts)
return this.chariPay.post('/v1/subscriptions', dto);
return this.chariPay.get('/v1/subscriptions', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/subscriptions/${reference}`);
return this.chariPay.get(`/v1/subscriptions/${reference}/charges`);
return this.chariPay.post(`/v1/subscriptions/${reference}/pause`);
return this.chariPay.post(`/v1/subscriptions/${reference}/resume`);
return this.chariPay.post(`/v1/subscriptions/${reference}/cancel`);
return this.chariPay.put(`/v1/subscriptions/${reference}/payment-method`, dto);
return this.chariPay.post(
  `/v1/subscriptions/${reference}/test-auto-pay`,
  undefined,
  { idempotencyKey: resolveIdempotencyKey(idempotencyKey, 'autopay') },
);

// after
return this.chari.subscriptions.create(dto);
return this.chari.subscriptions.list(query);
return this.chari.subscriptions.retrieve(reference);
return this.chari.subscriptions.charges(reference);
return this.chari.subscriptions.pause(reference);
return this.chari.subscriptions.resume(reference);
return this.chari.subscriptions.cancel(reference);
return this.chari.subscriptions.selectPaymentMethod(reference, dto);
return this.chari.subscriptions.testAutoPay(reference);
```

`testAutoPay` no longer needs a hand-rolled `resolveIdempotencyKey` helper —
the SDK generates and attaches a safe idempotency key automatically.

## Refunds

```ts
// before (example_psp/src/refunds/refunds.service.ts)
return this.chariPay.post('/v1/refunds', dto);
return this.chariPay.get('/v1/refunds', { params: toPageableParams(query) });
return this.chariPay.get(`/v1/refunds/${reference}`);

// after
return this.chari.refunds.create(dto);
return this.chari.refunds.list(query);
return this.chari.refunds.retrieve(reference);
```

## Analytics

```ts
// before (example_psp/src/analytics/analytics.service.ts)
return this.chariPay.get(`/v1/analytics/journeys/${resourceType}/${resourceId}/summary`);
return this.chariPay.get(
  `/v1/analytics/journeys/${resourceType}/${resourceId}/events`,
  { params: toPageableParams(query) },
);

// after
return this.chari.analytics.journeySummary(resourceType, resourceId);
return this.chari.analytics.journeyEvents(resourceType, resourceId, query);
```

## Webhooks

The tester app has no dedicated webhook-endpoint management service, but if
you're validating inbound webhook deliveries by hand — reading the
`X-Chari-Pay-Signature` header, computing an HMAC, and comparing timestamps —
that whole routine collapses to one call:

```ts
// before: hand-rolled HMAC verification + timestamp tolerance check

// after
const event = chari.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
```

And managing webhook endpoints and inspecting delivered events, which the
tester app doesn't cover at all, comes for free:

```ts
await chari.webhookEndpoints.create({ url: 'https://example.com/hooks/chari-pay', events: ['payment.succeeded'] });
await chari.webhookEndpoints.rotateSecret(endpointId);
await chari.webhookEvents.list({ endpointId });
```

## What you no longer maintain

- `ChariPayClientService` itself: base-URL selection, retry loop, and the
  auth header.
- `toPageableParams()` and the ad hoc `params` field-picking loops.
- `resolveIdempotencyKey()` and manually passed `idempotencyKey` options for
  mutating calls — the SDK generates and attaches these automatically where
  the API requires them.
- Response typing: every method returns a typed `Promise` (or `PagePromise`
  for `list()`), instead of `unknown` from a generic `get`/`post` wrapper.
