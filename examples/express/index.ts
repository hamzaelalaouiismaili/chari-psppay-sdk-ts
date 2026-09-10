import express from 'express';
import { ChariPay } from '@chari-pay/sdk';
import { chariPayWebhook } from '@chari-pay/sdk/express';

const chari = new ChariPay(process.env.CHARI_PAY_API_KEY!);
const app = express();

// Mounted BEFORE express.json so the raw bytes are still on the stream.
app.post('/webhooks/chari-pay', chariPayWebhook({ secret: process.env.CHARI_PAY_WEBHOOK_SECRET! }), (req, res) => {
  const event = req.chariPayEvent;
  if (event.type === 'payment.succeeded') {
    console.log('paid:', event.data.reference, event.data.amount);
  }
  res.sendStatus(200);
});

app.use(express.json());

app.post('/checkout', async (req, res) => {
  const link = await chari.paymentLinks.create({
    amount: req.body.amount,
    description: req.body.description,
    acceptUrl: 'https://shop.example.com/success',
    declineUrl: 'https://shop.example.com/cancel',
  });
  res.json({ url: link.payUrl });
});

app.listen(3000, () => console.log('listening on http://localhost:3000'));
