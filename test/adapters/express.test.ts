import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { captureRawBody, chariPayWebhook } from '../../adapters/express.js';

const SECRET = 'whsec_EXAMPLE';

function sign(rawBody: string, timestamp = Date.now()) {
  return {
    'chari-webhook-signature': createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex'),
    'chari-webhook-timestamp': String(timestamp),
    'chari-event-type': 'payment.succeeded',
    'content-type': 'application/json',
  };
}

describe('chariPayWebhook (express)', () => {
  it('verifies and exposes a typed event when mounted before express.json', async () => {
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (req, res) => {
      res.json({ type: req.chariPayEvent.type, reference: (req.chariPayEvent.data as { reference?: string }).reference });
    });
    app.use(express.json());

    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app).post('/webhooks').set(sign(body)).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 'payment.succeeded', reference: 'pl_1' });
  });

  it('works behind a global express.json when captureRawBody is used', async () => {
    const app = express();
    app.use(express.json({ verify: captureRawBody }));
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (req, res) => {
      res.json({ type: req.chariPayEvent.type });
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const res = await request(app).post('/webhooks').set(sign(body)).send(body);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('payment.succeeded');
  });

  it('rejects a bad signature with 400 and never calls the handler', async () => {
    let handlerRan = false;
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (_req, res) => {
      handlerRan = true;
      res.sendStatus(200);
    });

    const body = JSON.stringify({ reference: 'pl_1' });
    const headers = sign(body);
    headers['chari-webhook-signature'] = createHmac('sha256', 'whsec_WRONG').update(`x.${body}`).digest('hex');

    const res = await request(app).post('/webhooks').set(headers).send(body);

    expect(res.status).toBe(400);
    expect(handlerRan).toBe(false);
  });

  it('rejects a stale delivery with 400', async () => {
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (_req, res) => res.sendStatus(200));

    const body = JSON.stringify({ a: 1 });
    const res = await request(app).post('/webhooks').set(sign(body, Date.now() - 10 * 60 * 1000)).send(body);

    expect(res.status).toBe(400);
  });

  it('fails loudly when the raw body is unrecoverable', async () => {
    const app = express();
    app.use(express.json()); // consumes the stream, keeps no bytes
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (_req, res) => res.sendStatus(200));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: err.message });
    });

    const body = JSON.stringify({ a: 1 });
    const res = await request(app).post('/webhooks').set(sign(body)).send(body);

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/captureRawBody|before express\.json/i);
  });

  it('routes failures to a custom onError', async () => {
    const app = express();
    app.post(
      '/webhooks',
      chariPayWebhook({ secret: SECRET, onError: (_err, _req, res) => res.status(418).send('nope') }),
      (_req, res) => res.sendStatus(200),
    );

    const body = JSON.stringify({ a: 1 });
    const headers = sign(body);
    headers['chari-webhook-signature'] = 'deadbeef';

    const res = await request(app).post('/webhooks').set(headers).send(body);

    expect(res.status).toBe(418);
  });
});
