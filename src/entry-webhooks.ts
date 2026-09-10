/**
 * Build entry for the `@chari-pay/sdk/webhooks` subpath.
 *
 * This file exists only so tsup has something to build for the `webhooks`
 * output; it re-exports the real implementation from the package root
 * (`@chari-pay/sdk`), which is marked `external` in tsup.config.ts. That
 * keeps this entry's `require`/`import` pointing at the SAME built module as
 * every other entry point, instead of tsup inlining a second, distinct copy
 * of the classes and functions — which is what caused `instanceof` checks
 * and DI tokens to disagree across entries. See docs/design.md and the
 * final review for the full story.
 */
export {
  Webhooks,
  verifyWebhookSignature,
  parseEvent,
  SIGNATURE_TOLERANCE_MS,
  CHARI_PAY_EVENT_TYPES,
  isKnownEventType,
} from '@chari-pay/sdk';
export type {
  HeaderBag,
  VerifyOptions,
  ChariPayEvent,
  ChariPayUnknownEvent,
} from '@chari-pay/sdk';
