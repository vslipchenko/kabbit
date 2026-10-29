import { Module } from '@nestjs/common';
import { ReservationsConsumer } from './reservations.consumer.js';
import { StatsController } from './stats.controller.js';
import { StatsProjector } from './stats.projector.js';

// The Kafka consumer writes the read model; the HTTP controller reads it.
@Module({
  controllers: [StatsController],
  providers: [StatsProjector, ReservationsConsumer],
})
export class StatsModule {}
