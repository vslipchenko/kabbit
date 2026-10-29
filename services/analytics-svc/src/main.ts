// Must load before any decorated class, so the metadata API exists when decorators run.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Runs onApplicationShutdown on SIGTERM, so the Kafka consumer leaves the group cleanly and
  // commits its offsets instead of waiting for the session timeout.
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`HTTP listening on :${port}`, 'Bootstrap');
}

void bootstrap();
