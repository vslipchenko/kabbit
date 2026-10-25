import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { COMMAND_TYPES, type DecodeFailure, type ScheduleHousekeepingTask } from '@kabbit/contracts';
import { ack, deadLetter } from '../messaging/acknowledgements.js';
import { UNDECODABLE } from '../messaging/envelope.deserializer.js';

// Message handlers live in controllers, like HTTP routes; the deserializer picks the pattern.
// `@EventPattern<string>`: without the explicit type argument, Nest 12 picks its typed overload,
// which only allows `unknown` parameters after the payload, so `@Ctx() context: RmqContext` fails.
@Controller()
export class TasksConsumer {
  private readonly logger = new Logger(TasksConsumer.name);

  @EventPattern<string>(COMMAND_TYPES.scheduleHousekeepingTask)
  async onScheduleTask(@Payload() task: ScheduleHousekeepingTask, @Ctx() context: RmqContext): Promise<void> {
    try {
      this.logger.log(
        `Task ${task.payload.kind} for ${task.payload.propertyId} due ${task.payload.dueDate} (message ${task.messageId})`,
      );
      ack(context);
    } catch (err) {
      this.logger.error(`Task ${task.messageId} failed: ${(err as Error).message}`);
      await deadLetter(context, 'handler-error');
    }
  }

  // Poison messages: retrying can never fix them, so they go straight to the dead-letter queue.
  @EventPattern<string>(UNDECODABLE)
  async onUndecodable(@Payload() failure: DecodeFailure, @Ctx() context: RmqContext): Promise<void> {
    this.logger.warn(`Dead-lettering ${failure.reason} message: ${failure.error}`);
    await deadLetter(context, failure.reason);
  }
}
