/**
 * Value type for merchant-supplied `metadata` objects across the SDK.
 *
 * `api-1.yaml` declares every `metadata` field as
 * `additionalProperties: { type: object }`, which `openapi-typescript`
 * faithfully renders as `{ [key: string]: Record<string, never> }` — an index
 * signature whose values must be objects with *no* properties, i.e. only `{}`.
 * That type is unusable: the single most obvious call,
 * `metadata: { orderId: 'A-1' }`, fails to compile because `'A-1'` is a
 * `string`, not `Record<string, never>`.
 *
 * The schema contradicts its own documentation. Every `metadata` field's
 * `@example` in `api-1.yaml` uses string values —
 * `{ "cartId": "c_987" }`, `{ "customerId": "cus_1001", "plan": "gold" }` —
 * and the prose tells callers to "use opaque identifiers such as customerId
 * or contractId". The examples are the intended contract; the
 * `additionalProperties: { type: object }` schema is the bug in the spec.
 * `src/generated/api.ts` is never hand-edited (CI enforces freshness via
 * `codegen:check`), so this type overrides the generated shape at the
 * SDK-type layer instead — see docs/DECISIONS.md, and do not "correct" this
 * back to match `api-1.yaml`.
 *
 * This is a types-only override: it changes nothing about what is sent on
 * the wire. The object you pass is still serialised as-is.
 *
 * The value union is deliberately scalars only —
 * `string | number | boolean | null` — rather than `Record<string, unknown>`.
 * The spec calls these "opaque identifiers" and caps the serialized object at
 * 4 KB; scalars match that intent (flat reconciliation attributes, not
 * structured payloads) and, unlike `unknown`, keep out nested objects/arrays
 * that could silently balloon past the 4 KB ceiling or round-trip oddly
 * through webhook echoes. `any` is never used.
 */
export type ChariPayMetadata = Record<string, string | number | boolean | null>;

/**
 * Replaces a generated type's `metadata` property with {@link ChariPayMetadata},
 * leaving every other property — and whether `metadata` itself was required
 * or optional on the source type — untouched.
 *
 * This is a homomorphic mapped type (`[K in keyof T]`), so TypeScript copies
 * each property's optional/readonly modifiers from `T` automatically; only
 * the value type of `metadata` is swapped.
 */
export type WithMetadata<T> = {
  [K in keyof T]: K extends 'metadata' ? ChariPayMetadata : T[K];
};
