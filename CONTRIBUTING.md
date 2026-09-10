# Contributing to @chari-pay/sdk

Thanks for helping improve the SDK. A few rules keep the generated surface,
the hand-modelled gaps, and the tests trustworthy.

## Regenerating from `api-1.yaml`

`src/generated/api.ts` is produced by `openapi-typescript` from `api-1.yaml`.

- After **any** change to `api-1.yaml`, run:

  ```bash
  npm run codegen
  ```

  This overwrites `src/generated/api.ts`. Commit the regenerated file
  alongside your spec change.

- **Never hand-edit `src/generated/`.** Anything in that directory is
  overwritten the next time someone runs `npm run codegen`, so a manual fix
  there is silently lost — and it hides a spec problem that should be fixed
  upstream in `api-1.yaml` instead.

- CI enforces this with `npm run codegen:check`, which regenerates into a
  scratch file and diffs it against what's committed. A mismatch fails the
  build. Run it locally before opening a PR:

  ```bash
  npm run codegen:check
  ```

## Hand-modelled types

Some endpoints in `api-1.yaml` don't fully describe their response shape.
Where that happens, we model the type by hand in `src/types/gaps.ts` (or
`src/types/events.ts` for webhook event payloads) instead of trusting a
generated `unknown`.

**Every hand-modelled type must carry this line in its JSDoc:**

```ts
/**
 * `GET /v1/wallet`
 * @remarks Not defined in api-1.yaml; modelled from the endpoint description.
 * Verify against sandbox before 1.0.0.
 */
export interface WalletBalance {
  // ...
}
```

The `@remarks Not defined in api-1.yaml` line is what lets a reader (and a
future codegen pass) tell a spec-derived type from a best-guess one at a
glance. If you add a new hand-modelled type, follow the pattern above,
including a pointer to the endpoint and a note to verify it against a real
sandbox response before it's trusted for 1.0.0.

When Chari Pay's API team publishes a schema for a previously hand-modelled
response, delete the hand-rolled type, run `npm run codegen`, and switch
callers to the generated one.

## Tests use placeholder credentials only

Never commit a real API key, webhook secret, or other credential — including
in test fixtures, fixtures for docs, or example output pasted into a PR
description.

- Use `chari_sk_test_EXAMPLE` for API keys in tests and docs.
- Use an obviously fake value (e.g. `whsec_EXAMPLE`) for webhook secrets.
- `test/examples.test.ts` scans `README.md` for anything that looks like a
  real key or secret and fails the build if it finds one. The same check is
  run by hand before release:

  ```bash
  git grep -nE "chari_sk_(test|live)_[A-Za-z0-9]{8,}" -- ':!*.md' | grep -v EXAMPLE
  ```

  Expected output: nothing. Any hit means a real credential is staged and
  must be removed before it's committed or published.

## Before opening a PR

```bash
npm run codegen:check
npm run lint
npm run typecheck
npm test
npm run build
```

All five must be clean. If you changed `api-1.yaml`, make sure
`src/generated/api.ts` is regenerated and committed as part of the same
change.
