import { Module } from '@nestjs/common';
import { ChariPayModule } from '@chari-pay/sdk/nestjs';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [
    ChariPayModule.forRoot({
      apiKey: process.env.CHARI_PAY_API_KEY!,
      webhookSecret: process.env.CHARI_PAY_WEBHOOK_SECRET!,
    }),
  ],
  controllers: [WebhooksController],
})
export class AppModule {}
