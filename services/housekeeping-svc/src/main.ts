// Must load before any decorated class, so the metadata API exists when decorators run.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import type { Env } from './config.js';
import { EnvelopeDeserializer } from './messaging/envelope.deserializer.js';
import { declareTopology, TOPOLOGY } from './messaging/topology.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const rabbitUrl = config.get('RABBITMQ_URL', { infer: true });

  // Before consuming: the queues must exist, and Nest is told not to declare them itself.
  await declareTopology(rabbitUrl);
  Logger.log('RabbitMQ topology declared', 'Bootstrap');

  // A hybrid app: one Nest application serving HTTP and consuming RabbitMQ.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: TOPOLOGY.queue,
      // Our topology code declares the queue; if Nest asserted it with different arguments,
      // RabbitMQ would refuse with PRECONDITION_FAILED.
      noAssert: true,
      // Manual acks: a message is only removed once a handler says it is done.
      noAck: false,
      // At most this many unacked messages in flight to this consumer at once.
      prefetchCount: 10,
      deserializer: new EnvelopeDeserializer(),
    },
  });

  // Lets Nest run onModuleDestroy hooks on SIGTERM (docker stop), so connections close cleanly.
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`HTTP listening on :${port}, consuming ${TOPOLOGY.queue}`, 'Bootstrap');
}

void bootstrap();
