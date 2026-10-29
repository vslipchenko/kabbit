import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { channelReservationReceivedV1, SERVICES, TOPICS } from '@kabbit/contracts';
import { createKafka, EnvelopeProducer, startEnvelopeConsumer, type RunningConsumer } from '@kabbit/kafka';
import type { Env } from '../config.js';
import { StatsProjector } from './stats.projector.js';

// Nest's own Kafka transport is built on kafkajs, which is no longer maintained, so this service
// runs the shared Confluent-based consumer inside a provider instead. Lifecycle hooks tie it to
// the app: start once the database is ready, stop (committing offsets) on shutdown.
@Injectable()
export class ReservationsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReservationsConsumer.name);
  private readonly kafka;
  private readonly deadLetters;
  private consumer?: RunningConsumer;

  constructor(
    private readonly projector: StatsProjector,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.kafka = createKafka({ brokers: config.get('KAFKA_BROKERS', { infer: true }), clientId: SERVICES.analyticsSvc });
    this.deadLetters = new EnvelopeProducer(this.kafka);
  }

  async onApplicationBootstrap(): Promise<void> {
    const groupId = this.config.get('KAFKA_GROUP_ID', { infer: true });
    const failureRate = this.config.get('SIMULATE_FAILURE_RATE', { infer: true });
    await this.deadLetters.connect();
    this.consumer = await startEnvelopeConsumer({
      kafka: this.kafka,
      groupId,
      topics: [TOPICS.channelReservations],
      definitions: [channelReservationReceivedV1],
      deadLetters: this.deadLetters,
      logger: this.logger,
      handle: async (event, record) => {
        if (Math.random() < failureRate) throw new Error('Simulated transient failure');
        const applied = await this.projector.apply(event, record);
        this.logger.log(
          `${applied ? 'Applied' : 'Duplicate, skipped'} ${event.payload.channel} booking for ${event.payload.propertyId} ` +
            `from partition ${record.partition} @ ${record.offset}`,
        );
      },
    });
    this.logger.log(`Consuming ${TOPICS.channelReservations} as group ${groupId}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer?.stop();
    await this.deadLetters.disconnect();
  }
}
