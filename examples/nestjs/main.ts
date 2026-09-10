import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: true is required for webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await app.listen(3000);
}
void bootstrap();
