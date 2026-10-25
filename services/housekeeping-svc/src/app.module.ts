import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config.js';
import { HealthController } from './health.controller.js';
import { TasksConsumer } from './tasks/tasks.consumer.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  controllers: [HealthController, TasksConsumer],
})
export class AppModule {}
