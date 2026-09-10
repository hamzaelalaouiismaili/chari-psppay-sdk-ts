import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // dist.test.ts runs against the BUILT package (`npm run test:dist`), not
    // the source tree, so it is excluded from the normal `npm test` run.
    exclude: ['test/dist.test.ts', '**/node_modules/**'],
  },
  resolve: {
    alias: [
      // The adapters (and the `webhooks` build entry) import the package by
      // its own specifier so that a single build can be shared across every
      // tsup entry point (see tsup.config.ts). Tests run straight against
      // `src/`, so point those specifiers back at the real source here.
      { find: /^@chari-pay\/sdk\/webhooks$/, replacement: `${root}src/webhooks.ts` },
      { find: /^@chari-pay\/sdk$/, replacement: `${root}src/index.ts` },
    ],
  },
});
