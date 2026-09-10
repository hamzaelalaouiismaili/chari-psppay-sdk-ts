/**
 * Runs ONLY against the built `dist/` output (see vitest.dist.config.ts and
 * the `test:dist` script — this file requires `npm run build` to have run
 * first). Every other test in this repo imports `../src` directly, which is
 * exactly why the four tsup entry points silently re-bundling their own
 * copy of every class shipped without a single test catching it (final
 * review, Blocker 1). This file proves the fix: a single copy of the
 * runtime code is shared across every entry point, in both the CJS and ESM
 * builds.
 */
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);

function distFile(name: string): string {
  return path.join(dist, name);
}

const SECRET = 'whsec_dist_test_EXAMPLE';

function sign(rawBody: string, timestamp = Date.now()) {
  return {
    'chari-webhook-signature': createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex'),
    'chari-webhook-timestamp': String(timestamp),
    'chari-event-type': 'payment.succeeded',
    'content-type': 'application/json',
  };
}

beforeAll(() => {
  if (!existsSync(dist) || !existsSync(distFile('index.cjs'))) {
    throw new Error(
      'dist/ is missing or incomplete. test/dist.test.ts asserts properties of the BUILT package — ' +
        'run `npm run build` first, or use `npm run test:dist` which does that for you.',
    );
  }
});

describe('dist/ — CJS: a single copy of the runtime is shared across entry points', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let idx: any, wh: any, ex: any, ns: any;

  beforeAll(() => {
    idx = require(distFile('index.cjs'));
    wh = require(distFile('webhooks.cjs'));
    ex = require(distFile('express.cjs'));
    ns = require(distFile('nestjs.cjs'));
  });

  it('ChariPay is the identical class from index.cjs and nestjs.cjs (the NestJS DI token bug)', () => {
    expect(ns.ChariPay).toBe(idx.ChariPay);
  });

  it('the webhooks entry throws the SAME ChariPayError/ChariPaySignatureVerificationError classes as index', () => {
    let caught: unknown;
    try {
      wh.verifyWebhookSignature({ rawBody: '{}', headers: {}, secret: SECRET });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(idx.ChariPaySignatureVerificationError);
    expect(caught).toBeInstanceOf(idx.ChariPayError);
  });

  it('express.cjs uses the SAME ChariPaySignatureVerificationError as index.cjs internally: a bad signature is 400, not 500', async () => {
    const app = express();
    app.post('/webhooks/chari-pay', ex.chariPayWebhook({ secret: SECRET }), (req: express.Request, res: express.Response) => {
      res.json({ type: req.chariPayEvent.type });
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const res = await request(app).post('/webhooks/chari-pay').set(headers).send(body);
    // If the express.cjs build carried its OWN copy of ChariPaySignatureVerificationError
    // (the pre-fix bug), `error instanceof ChariPaySignatureVerificationError` inside
    // adapters/express.ts would be false, the catch would fall through to `next(error)`,
    // and this would come back as a 500 instead of a deliberate 400.
    expect(res.status).toBe(400);
  });

  it('express.cjs verifies and forwards a valid delivery end to end (a real call through the built entry)', async () => {
    const app = express();
    app.post('/webhooks/chari-pay', ex.chariPayWebhook({ secret: SECRET }), (req: express.Request, res: express.Response) => {
      res.json({ type: req.chariPayEvent.type });
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app).post('/webhooks/chari-pay').set(sign(body)).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 'payment.succeeded' });
  });

  it('nestjs.cjs ChariPayWebhookGuard uses the SAME error classes as index.cjs internally', () => {
    const guard = new ns.ChariPayWebhookGuard({ webhookSecret: SECRET });
    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const fakeContext = {
      switchToHttp: () => ({
        getRequest: () => ({ rawBody: Buffer.from(body), headers }),
      }),
    };

    let caught: unknown;
    try {
      guard.canActivate(fakeContext);
    } catch (err) {
      caught = err;
    }
    const { BadRequestException } = require('@nestjs/common');
    // Pre-fix, nestjs.cjs bundled its own ChariPaySignatureVerificationError,
    // so `error instanceof ChariPaySignatureVerificationError` inside
    // adapters/nestjs.ts was false, and the raw error (not a BadRequestException)
    // was rethrown — a 500 in a real Nest app instead of the documented 400.
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as { getStatus(): number }).getStatus()).toBe(400);
    expect((caught as { getResponse(): unknown }).getResponse()).toEqual({
      error: { code: 'INVALID_SIGNATURE', message: expect.any(String) },
    });
  });
});

describe('dist/ — ESM: a single copy of the runtime is shared across entry points', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let idx: any, wh: any, ex: any, ns: any;

  beforeAll(async () => {
    idx = await import(pathToFileURL(distFile('index.js')).href);
    wh = await import(pathToFileURL(distFile('webhooks.js')).href);
    ex = await import(pathToFileURL(distFile('express.js')).href);
    ns = await import(pathToFileURL(distFile('nestjs.js')).href);
  });

  it('ChariPay is the identical class from index.js and nestjs.js', () => {
    expect(ns.ChariPay).toBe(idx.ChariPay);
  });

  it('the webhooks entry throws the SAME ChariPayError/ChariPaySignatureVerificationError classes as index', () => {
    let caught: unknown;
    try {
      wh.verifyWebhookSignature({ rawBody: '{}', headers: {}, secret: SECRET });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(idx.ChariPaySignatureVerificationError);
    expect(caught).toBeInstanceOf(idx.ChariPayError);
  });

  it('express.js verifies and forwards a valid delivery end to end (a real call through the built ESM entry)', async () => {
    const app = express();
    app.post('/webhooks/chari-pay', ex.chariPayWebhook({ secret: SECRET }), (req: express.Request, res: express.Response) => {
      res.json({ type: req.chariPayEvent.type });
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app).post('/webhooks/chari-pay').set(sign(body)).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 'payment.succeeded' });
  });

  it('a bad signature through express.js is 400, not 500', async () => {
    const app = express();
    app.post('/webhooks/chari-pay', ex.chariPayWebhook({ secret: SECRET }), (req: express.Request, res: express.Response) => {
      res.json({ type: req.chariPayEvent.type });
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const res = await request(app).post('/webhooks/chari-pay').set(headers).send(body);
    expect(res.status).toBe(400);
  });
});

describe('dist/ — package.json exports map', () => {
  it('every declared subpath resolves to a file that exists', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(path.join(root, 'package.json'));
    for (const [specifier, targets] of Object.entries(pkg.exports as Record<string, Record<string, string>>)) {
      for (const [condition, relPath] of Object.entries(targets)) {
        const abs = path.join(root, relPath);
        expect(existsSync(abs), `exports["${specifier}"].${condition} → ${relPath} does not exist`).toBe(true);
      }
    }
  });
});
