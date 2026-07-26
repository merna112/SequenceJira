import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AiWorkerModule } from './ai-worker.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Create NestJS app with rawBody enabled to support GitHub HMAC Webhook verification
  const app = await NestFactory.create(AiWorkerModule, { rawBody: true });
  
  app.enableCors();
  
  const port = process.env.PORT || 5000;
  await app.listen(port);
  
  logger.log(`SequenceJira AI Worker App is running on: http://localhost:${port}`);
}
bootstrap();
