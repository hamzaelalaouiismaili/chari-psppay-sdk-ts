import { defineConfig } from 'vitest/config';

/**
 * Runs ONLY `test/dist.test.ts`, against the files actually shipped in
 * `dist/` — not `src/`. Requires a build first: `npm run test:dist` does
 * `npm run build && vitest run -c vitest.dist.config.ts`.
 *
 * This exists because the whole-branch review found that all 138 tests
 * under the normal `npm test` imported `../src` directly, so the four
 * tsup entry points silently diverging (each re-bundling its own copy of
 * every class) shipped without a single test catching it. See
 * docs/design.md and the final review for the story.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/dist.test.ts'],
  },
});
