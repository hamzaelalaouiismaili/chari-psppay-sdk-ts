import { verifyWebhookSignature, parseEvent } from '@chari-pay/sdk/webhooks';

/** Next.js App Router gives you the raw body via `await request.text()`. */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  try {
    verifyWebhookSignature({ rawBody, headers, secret: process.env.CHARI_PAY_WEBHOOK_SECRET! });
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  const event = parseEvent(rawBody, headers);
  if (event.type === 'payment.succeeded') {
    // fulfil the order
  }
  return Response.json({ received: true });
}
