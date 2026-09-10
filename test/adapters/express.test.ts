import { createHmac } from 'node:crypto';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
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

  it('rejects a raw body larger than maxBodyBytes with 413, without buffering it all', async () => {
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET, maxBodyBytes: 1024 }), (_req, res) => res.sendStatus(200));

    // Comfortably over the 1 KiB cap; a real attack would be far larger, but
    // this is enough to prove the cap trips before the body is fully read.
    const oversized = 'a'.repeat(1024 * 64);
    const res = await request(app)
      .post('/webhooks')
      .set('content-type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('BODY_TOO_LARGE');
  });

  it('honours a default 1 MiB cap when maxBodyBytes is not set', async () => {
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET }), (_req, res) => res.sendStatus(200));

    const oversized = 'a'.repeat(1024 * 1024 + 1);
    const res = await request(app)
      .post('/webhooks')
      .set('content-type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
  });

  it('rejects with 408 when reading the raw body exceeds bodyTimeoutMs (slowloris guard)', async () => {
    const app = express();
    app.post('/webhooks', chariPayWebhook({ secret: SECRET, bodyTimeoutMs: 50 }), (_req, res) => res.sendStatus(200));
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = net.createConnection(port, '127.0.0.1', () => {
          socket.write(
            'POST /webhooks HTTP/1.1\r\n' +
              'Host: localhost\r\n' +
              'Content-Type: application/json\r\n' +
              'Content-Length: 20\r\n' +
              'Connection: close\r\n\r\n' +
              '{"a":1', // deliberately incomplete — never sends the rest, so `end` never fires
          );
        });
        let raw = '';
        socket.on('data', (chunk) => {
          raw += chunk.toString('utf8');
        });
        socket.on('end', () => {
          const statusLine = raw.split('\r\n')[0] ?? '';
          const match = /HTTP\/1\.\d (\d+)/.exec(statusLine);
          resolve(match ? Number(match[1]) : 0);
        });
        socket.on('error', reject);
        setTimeout(() => reject(new Error('socket test timed out')), 5000);
      });

      expect(status).toBe(408);
    } finally {
      server.close();
    }
  });
});
