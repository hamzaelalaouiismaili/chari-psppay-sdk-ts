# Decisions and known limitations

Design decisions taken during implementation that a reader of the code would not
otherwise be able to reconstruct, plus the issues deliberately left open for 1.0.

The design spec is `docs/design.md`.

---

## Deliberate trade-offs

### `ChariPayEvent` is a pure 21-member union, and that is an approximation

`if (event.type === 'payment.succeeded') { event.data.amount }` narrows to
`number | undefined` with no extra check. That ergonomics is the point — it is
the SDK's most-used line.

The cost: TypeScript cannot express "any string except these 21 literals", so a
catch-all member with a non-literal discriminant would defeat narrowing for the
*whole* union. The union therefore lists only the 21 known events, while at
runtime an unrecognised `type` still arrives and is still returned without
throwing.

**Consequence for you:** keep a `default` / `else` branch. An exhaustiveness
check against `never` will wrongly believe the 21 cases are total, and a caller
without a fallback silently ignores new Chari Pay event types. Use
`isKnownEventType()` or `ChariPayUnknownEvent` when you need a sound check.

### `apiKey` is required even for keyless checkout

The four `/checkout/*` operations are declared `security: []` upstream and never
transmit `X-CHARI-PAY-API-KEY`. A checkout-only integration still has to supply
an `apiKey` to construct the client; any non-empty placeholder works, since it is
never sent on those calls. Kept mandatory for 1.0 to avoid a config shape whose
validity depends on which methods you happen to call.

### Environment inference is deliberately narrow, and fails closed

`resolveBaseUrl` recognises exactly two key prefixes — `chari_sk_test_`
(sandbox) and `chari_sk_live_` (production) — and throws a `TypeError` for
anything else, including real Chari Pay sandbox keys shaped like
`flex_…`.

This is narrower than it looks like it should be. The obvious alternative —
guess sandbox vs. production from whatever the key's shape suggests — is
unsound in principle: Chari Pay's server, not the key's shape, is the actual
source of truth for which environment a key belongs to. An early version of
this SDK inferred production for any key that didn't match a placeholder
pattern seen in one tester app's `.env.example`; a real sandbox key of a
different shape fell through to that default, so a developer following the
README exactly would have silently pointed sandbox traffic at production.
That is the worst failure mode a payments SDK can have — quiet, and toward
the environment where mistakes cost money.

Defaulting to sandbox instead would be equally wrong the other way: real
payments would quietly go nowhere. So the only defensible move for a key
whose environment can't be proven from its prefix is to refuse to guess.
`resolveBaseUrl` throws, naming both `SANDBOX_BASE_URL` and
`PRODUCTION_BASE_URL` and showing the `new ChariPay({ apiKey, baseUrl })`
fix, and an explicit `baseUrl` is the supported path for any key format the
two recognised prefixes don't cover.

### Pagination trusts the server's `Page.number`

Iteration decides it has reached the last page using the server-reported
absolute page index, falling back to the loop index when the server omits it.
A backend that misreports `number` could therefore terminate iteration early.
The alternative — counting loop iterations — is wrong whenever a caller starts
at a non-zero `page`, which is the more common failure.

### `metadata` is typed as `ChariPayMetadata`, overriding the generated shape

`api-1.yaml` declares every `metadata` field as `additionalProperties: { type: object }`.
`openapi-typescript` renders that literally as `{ [key: string]: Record<string, never> }`
— an index signature whose values must be objects with no properties, i.e. only
`{}`. That made `metadata` unusable: `chari.paymentLinks.create({ ..., metadata:
{ orderId: 'A-1' } })`, the single most obvious call, did not compile, because
`'A-1'` is a `string`, not `Record<string, never>`.

The spec contradicts itself here: every affected field's own `@example` uses
string values (`{ "cartId": "c_987" }`, `{ "customerId": "cus_1001", "plan":
"gold" }`), and the prose instructs callers to "use opaque identifiers such as
customerId or contractId". The examples are the intended contract; the
`additionalProperties: { type: object }` schema is the bug. **Do not "correct"
the SDK's `metadata` type back to match `api-1.yaml`** — that would restore the
broken behaviour this entry documents. If a future spec revision fixes the
schema, drop the override and use the generated type directly.

Because `src/generated/api.ts` is never hand-edited (`codegen:check` enforces
freshness in CI), the fix lives at the SDK-type layer: `ChariPayMetadata`
(`src/types/metadata.ts`) is `Record<string, string | number | boolean |
null>`, and a homomorphic mapped type, `WithMetadata<T>`, substitutes it for
the generated `metadata` property on every affected request/response type
(`CreatePaymentLinkParams`/`PaymentLink`, `CreateSubscriptionParams`/
`Subscription`, `CreateRefundParams`, `CreateProductParams`/`Product`,
`CreateCheckoutSessionParams`) while leaving every other property —
including whether `metadata` itself is required or optional — untouched.
Scalars only, not `Record<string, unknown>`: the spec calls these "opaque
identifiers" and caps the serialized object at 4 KB, which scalars match and
`unknown` would not meaningfully constrain. This is a types-only change —
the object sent on the wire is unchanged, still serialised as-is by
`JSON.stringify`.

### `PagePromise` implements the full `Promise` interface

`PagePromise<T>` used to implement only `PromiseLike<Page<T>>` (just `then`),
so `await` worked but `.catch()`, `.finally()`, `Promise.all([...])`, and any
`Promise<T>`-typed position all failed to typecheck — a real call site broke
on exactly this (`const p: Promise<unknown> = chari.transactions.list()`).

`PagePromise<T>` now `implements Promise<Page<T>>`, adding `catch`, `finally`
and `[Symbol.toStringTag]`. The laziness that matters is unchanged: the
constructor never calls `fetchPage`; the underlying request still only fires
when the promise is actually consumed (`then`/`catch`/`finally`/`await`) or
iterated. `catch` and `finally` are implemented by delegating through `then`
to a native `Promise`, not by eagerly resolving in the constructor.

### Subpath entries share one runtime copy

`@chari-pay/sdk/webhooks`, `/express` and `/nestjs` import the package root by
its own name rather than re-bundling `src/`. Without this, each entry carried its
own copy of every class: NestJS dependency injection broke on its documented
path, and cross-entry `instanceof` failed, turning documented 400 responses into
500s. `test/dist.test.ts` asserts constructor identity across all four entries in
both CJS and ESM — it must keep asserting identity, not `instanceof`, because
`ChariPayError`'s `Symbol.hasInstance` brand would satisfy `instanceof` even if
re-bundling regressed.

---

### `billingTime` is a string, not the generated `LocalTime` object

`api-1.yaml` types a subscription's `billingTime` as `$ref: LocalTime` — a
Java-shaped `{ hour?, minute?, second?, nano? }` object — while the very same
field carries `example: 09:00`, a string. The `example_psp` tester app, proven
against the live sandbox, sends it as an `HH:mm` string.

As with `metadata`, the examples are the real contract and the schema is the
bug. `ChariPayLocalTime` overrides it at the SDK-type layer; the wire format is
unchanged. Both overrides are types-only and both are listed here so nobody
"corrects" them back to match the spec.

## Known limitations

Real, understood, and not fixed. Ranked by how likely they are to matter.

1. **A custom `onError` on the Express middleware bypasses `Connection: close`.**
   On a body-size or read-timeout rejection the default path sets that header so
   the socket is torn down after the 413/408. A user-supplied `onError` replaces
   that response and can leave the connection open, weakening the slowloris
   mitigation. Set the header yourself if you override `onError`.

2. **The `webhooks` entry does not re-export the error classes.** A webhook-only
   service that wants `catch (e) { if (e instanceof ChariPaySignatureVerificationError) }`
   must import them from the package root. Verification itself works fine.

3. **Cardholder name reaches `onRequest` unredacted.** `pan`, `cvv` and
   `expiryDate` are redacted before the hook sees a body; `firstName` /
   `lastName` are not. That is PII, not PCI cardholder data, but treat your log
   sink accordingly. Conversely, fields matching `number` or `token` are
   redacted in the hook's view even when benign — the wire body is never altered.

4. **`captureRawBody` skips zero-length bodies**, so an empty payload behind a
   global `express.json()` produces a setup error rather than a verification
   attempt. An empty webhook delivery is not a real case, and the error is loud.

5. **`parseFilename` does not percent-decode RFC 5987 `filename*=UTF-8''…`.**
   Affects only the suggested filename on binary downloads.

6. **The hand-modelled types are unverified against a live sandbox.** Every type
   in `src/types/gaps.ts` and `src/types/events.ts` carries an explicit
   `@remarks Not defined in api-1.yaml` line. 32 of the API's 62 operations have
   no documented success schema, and the OpenAPI spec defines webhook event
   *names* but no per-event payload schema. These shapes are a careful reading of
   the endpoint documentation, not a contract. Verify them against real sandbox
   traffic before depending on a field, and before 1.0.

7. **`GET /v1/transactions` accepts both `cursor`/`limit` and a Spring
   `pageable`.** Both are exposed; which one the server actually honours has not
   been confirmed against the sandbox.

---

## Testing notes for maintainers

- The `expectTypeOf` tests in `test/events.types.test.ts` are **runtime no-ops** —
  vitest strips types. Only `npx tsc --noEmit` enforces them, which CI runs.
- `test/dist.test.ts` runs against built output and is excluded from `npm test`.
  Run `npm run test:dist` (it builds first); CI runs it after the build step.
- The coverage map's headline `expect(total).toBe(62)` sums its own literal map
  and is self-referential. The 62 per-method assertions beneath it are what
  actually check the shipped `ChariPay` instance.
