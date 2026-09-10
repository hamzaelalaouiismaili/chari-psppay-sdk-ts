import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    webhooks: 'src/entry-webhooks.ts',
    express: 'adapters/express.ts',
    nestjs: 'adapters/nestjs.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  // `webhooks`, `express`, and `nestjs` all import the package root (and,
  // for `express`/`nestjs`, the `webhooks` subpath) by specifier rather than
  // by relative path into `src/`. Marking those specifiers external stops
  // tsup from inlining a second copy of the runtime code into every entry —
  // each subpath's built output does a real `require`/`import` of the built
  // `index`/`webhooks` output instead, so `instanceof` checks and NestJS DI
  // tokens agree across entry points. `splitting: true` does not achieve
  // this for CJS output, which is why this uses external imports instead.
  external: ['express', '@nestjs/common', '@nestjs/core', '@chari-pay/sdk', /^@chari-pay\/sdk\/.*/],
});
