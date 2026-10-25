import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HousekeepingTask } from './housekeeping-task.entity.js';
import { TasksConsumer } from './tasks.consumer.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

// One feature module: the HTTP controller and the message consumer share the same service.
@Module({
  imports: [TypeOrmModule.forFeature([HousekeepingTask])],
  controllers: [TasksController, TasksConsumer],
  providers: [TasksService],
})
export class TasksModule {}
