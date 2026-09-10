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
    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(sign(body)).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ type: 'payment.succeeded', sandbox: true });
  });

  it('rejects a forged delivery with 400', async () => {
    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const res = await request(app.getHttpServer()).post('/webhooks/chari-pay').set(headers).send(body);

    expect(res.status).toBe(400);
  });

  it('rejects a stale delivery with 400', async () => {
    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app.getHttpServer())
      .post('/webhooks/chari-pay')
      .set(sign(body, Date.now() - 10 * 60 * 1000))
      .send(body);

    expect(res.status).toBe(400);
  });
});

describe('ChariPayModule.forRootAsync', () => {
  it('builds the client from a factory', async () => {
    @Module({
      imports: [
        ChariPayModule.forRootAsync({
          useFactory: () => ({ apiKey: 'chari_sk_test_EXAMPLE', webhookSecret: SECRET }),
        }),
      ],
    })
    class AsyncAppModule {}

    const asyncApp = await NestFactory.create(AsyncAppModule, { rawBody: true, logger: false });
    await asyncApp.init();
    expect(asyncApp.get(ChariPay)).toBeInstanceOf(ChariPay);
    await asyncApp.close();
  });
});
