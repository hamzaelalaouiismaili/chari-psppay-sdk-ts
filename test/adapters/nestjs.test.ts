import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { Controller, Inject, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChariPay } from '../../src/index.js';
import { ChariPayEventPayload, ChariPayModule, ChariPayWebhook } from '../../adapters/nestjs.js';
import type { ChariPayEvent } from '../../src/types/events.js';

const SECRET = 'whsec_EXAMPLE';

/** Mutable counter the controllers below increment so tests can prove (or disprove) that the handler ran. */
const handlerCalls = { count: 0 };

@Controller('webhooks')
class TestController {
  // Vitest transpiles with esbuild, which honours `experimentalDecorators` but
  // does NOT emit `emitDecoratorMetadata`. Without `design:paramtypes`, Nest
  // cannot infer the token from the constructor type, so the token is explicit
  // here. Consumer apps built with tsc or ts-jest can write
  // `constructor(private readonly chari: ChariPay) {}` as the README shows.
  constructor(@Inject(ChariPay) readonly chari: ChariPay) {}

  @Post('chari-pay')
  @ChariPayWebhook()
  handle(@ChariPayEventPayload() event: ChariPayEvent) {
    handlerCalls.count += 1;
    return { type: event.type, sandbox: this.chari.isSandbox };
  }
}

@Module({
  imports: [ChariPayModule.forRoot({ apiKey: 'chari_sk_test_EXAMPLE', webhookSecret: SECRET })],
  controllers: [TestController],
})
class TestAppModule {}

function sign(rawBody: string, timestamp = Date.now()) {
  return {
    'chari-webhook-signature': createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex'),
    'chari-webhook-timestamp': String(timestamp),
    'chari-event-type': 'payment.succeeded',
    'content-type': 'application/json',
  };
}

describe('ChariPayModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // rawBody: true is what keeps the untouched bytes on req.rawBody.
    app = await NestFactory.create(TestAppModule, { rawBody: true, logger: false });
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('injects a configured ChariPay client', () => {
    expect(app.get(ChariPay)).toBeInstanceOf(ChariPay);
    expect(app.get(ChariPay).isSandbox).toBe(true);
  });

  it('accepts a valid delivery and supplies the typed event', async () => {
    const before = handlerCalls.count;
    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(sign(body)).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ type: 'payment.succeeded', sandbox: true });
    expect(handlerCalls.count).toBe(before + 1);
  });

  it('rejects a forged delivery with 400 and never calls the handler', async () => {
    const before = handlerCalls.count;
    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(headers).send(body);

    expect(res.status).toBe(400);
    expect(handlerCalls.count).toBe(before);
  });

  it('rejects a stale delivery with 400 and never calls the handler', async () => {
    const before = handlerCalls.count;
    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app.getHttpServer())
      .post('/webhooks/chari-pay')
      .set(sign(body, Date.now() - 10 * 60 * 1000))
      .send(body);

    expect(res.status).toBe(400);
    expect(handlerCalls.count).toBe(before);
  });
});

describe('ChariPayModule.forRootAsync', () => {
  it('builds the client from the factory-supplied values, not defaults', async () => {
    const distinctiveBaseUrl = 'https://mock.chari.test';

    @Module({
      imports: [
        ChariPayModule.forRootAsync({
          useFactory: () => ({
            apiKey: 'chari_sk_test_EXAMPLE',
            webhookSecret: SECRET,
            baseUrl: distinctiveBaseUrl,
          }),
        }),
      ],
    })
    class AsyncAppModule {}

    const asyncApp = await NestFactory.create(AsyncAppModule, { rawBody: true, logger: false });
    await asyncApp.init();
    const client = asyncApp.get(ChariPay);
    expect(client).toBeInstanceOf(ChariPay);
    // If the factory's values were dropped in favour of defaults, baseUrl would
    // resolve from the apiKey prefix instead of reflecting what the factory returned.
    expect(client.config.baseUrl).toBe(distinctiveBaseUrl);
    await asyncApp.close();
  });
});

describe('ChariPayWebhookGuard misconfiguration: missing webhookSecret', () => {
  const noSecretHandlerCalls = { count: 0 };

  @Controller('webhooks')
  class NoSecretController {
    @Post('chari-pay')
    @ChariPayWebhook()
    handle(@ChariPayEventPayload() event: ChariPayEvent) {
      noSecretHandlerCalls.count += 1;
      return { type: event.type };
    }
  }

  // No `webhookSecret` at all: the guard must refuse to pretend it verified anything.
  @Module({
    imports: [ChariPayModule.forRoot({ apiKey: 'chari_sk_test_EXAMPLE' })],
    controllers: [NoSecretController],
  })
  class NoSecretAppModule {}

  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(NoSecretAppModule, { rawBody: true, logger: false });
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('surfaces ChariPayWebhookSetupError as a 500, not a 400, and never calls the handler', async () => {
    const before = noSecretHandlerCalls.count;
    const body = JSON.stringify({ reference: 'pl_1' });
    // Signed with a secret the module was never given — proves this isn't
    // failing on a bad signature, but on the missing-secret setup check.
    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(sign(body)).send(body);

    // ChariPayWebhookSetupError extends ChariPayError extends Error, not
    // HttpException, so Nest's default filter maps it to 500 — distinct from
    // the 400 a BadRequestException produces for a bad signature. Conflating
    // the two is exactly the bug this test exists to catch.
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(400);
    expect(noSecretHandlerCalls.count).toBe(before);
  });
});

describe('ChariPayWebhookGuard misconfiguration: missing req.rawBody', () => {
  const noRawBodyHandlerCalls = { count: 0 };

  @Controller('webhooks')
  class NoRawBodyController {
    @Post('chari-pay')
    @ChariPayWebhook()
    handle(@ChariPayEventPayload() event: ChariPayEvent) {
      noRawBodyHandlerCalls.count += 1;
      return { type: event.type };
    }
  }

  @Module({
    imports: [ChariPayModule.forRoot({ apiKey: 'chari_sk_test_EXAMPLE', webhookSecret: SECRET })],
    controllers: [NoRawBodyController],
  })
  class NoRawBodyAppModule {}

  let app: INestApplication;

  beforeAll(async () => {
    // Deliberately built WITHOUT `{ rawBody: true }` — req.rawBody stays undefined.
    app = await NestFactory.create(NoRawBodyAppModule, { logger: false });
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('surfaces ChariPayWebhookSetupError as a 500, not a 400, and never calls the handler', async () => {
    const before = noRawBodyHandlerCalls.count;
    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(sign(body)).send(body);

    expect(res.status).toBe(500);
    expect(res.status).not.toBe(400);
    expect(noRawBodyHandlerCalls.count).toBe(before);
  });
});

describe('ChariPayEventPayload without ChariPayWebhook', () => {
  @Controller('webhooks')
  class UnguardedController {
    // No @ChariPayWebhook() guard applied — req.chariPayEvent is never populated.
    @Post('unguarded')
    handle(@ChariPayEventPayload() event: ChariPayEvent) {
      return { type: event.type };
    }
  }

  @Module({
    imports: [ChariPayModule.forRoot({ apiKey: 'chari_sk_test_EXAMPLE', webhookSecret: SECRET })],
    controllers: [UnguardedController],
  })
  class UnguardedAppModule {}

  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(UnguardedAppModule, { rawBody: true, logger: false });
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('throws a setup error instead of silently returning undefined', async () => {
    const res = await request(app.getHttpServer()).post('/webhooks/unguarded').send({});

    expect(res.status).toBe(500);
    // Confirms the handler never got a chance to read `event.type` off undefined.
    expect(res.body).not.toEqual({ type: undefined });
  });
});
