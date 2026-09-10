import { Controller, HttpCode, Post } from '@nestjs/common';
import { ChariPay } from '@chari-pay/sdk';
import { ChariPayEventPayload, ChariPayWebhook, type ChariPayEvent } from '@chari-pay/sdk/nestjs';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly chari: ChariPay) {}

  @Post('chari-pay')
  @HttpCode(200)
  @ChariPayWebhook()
  async handle(@ChariPayEventPayload() event: ChariPayEvent) {
    if (event.type === 'payment.succeeded') {
      const tx = await this.chari.transactions.retrieve(String(event.data.operationId));
      console.log('settled', tx.status);
    }
    return { received: true };
  }
}
