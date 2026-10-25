import { Controller, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { COMMAND_TYPES, type DecodeFailure, type ScheduleHousekeepingTask } from '@kabbit/contracts';
import type { Env } from '../config.js';
import { ack, deadLetter, failedAttempts, retryLater } from '../messaging/acknowledgements.js';
import { UNDECODABLE } from '../messaging/envelope.deserializer.js';
import { TOPOLOGY } from '../messaging/topology.js';
import { TasksService } from './tasks.service.js';

// A refused connection surfaces as an AggregateError with an empty message; the code says what happened.
const describeError = (err: unknown): string => {
  const { message, code } = err as { message?: string; code?: string };
  return [code, message].filter(Boolean).join(': ') || String(err);
};

// Message handlers live in controllers, like HTTP routes; the deserializer picks the pattern.
// `@EventPattern<string>`: without the explicit type argument, Nest 12 picks its typed overload,
// which only allows `unknown` parameters after the payload, so `@Ctx() context: RmqContext` fails.
@Controller()
export class TasksConsumer {
  private readonly logger = new Logger(TasksConsumer.name);
  private readonly failureRate: number;

  constructor(
    private readonly tasks: TasksService,
    config: ConfigService<Env, true>,
  ) {
    this.failureRate = config.get('SIMULATE_FAILURE_RATE', { infer: true });
  }

  @EventPattern<string>(COMMAND_TYPES.scheduleHousekeepingTask)
  async onScheduleTask(@Payload() task: ScheduleHousekeepingTask, @Ctx() context: RmqContext): Promise<void> {
    const attempt = failedAttempts(context) + 1;
    try {
      if (Math.random() < this.failureRate) throw new Error('Simulated transient failure');
      const created = await this.tasks.schedule(task);
      this.logger.log(
        created
          ? `Scheduled ${task.payload.kind} for ${task.payload.propertyId} due ${task.payload.dueDate} (message ${task.messageId}, attempt ${attempt})`
          : `Duplicate message ${task.messageId}, already stored`,
      );
      // Ack only after the commit: a crash before this line means redelivery, never a lost task.
      ack(context);
    } catch (err) {
      // The message itself is valid (it decoded), so the failure is assumed transient: the
      // database is down, a deadlock, a timeout. Worth retrying, but not forever.
      const reason = describeError(err);
      if (attempt < TOPOLOGY.maxAttempts) {
        this.logger.warn(`Message ${task.messageId} failed (attempt ${attempt}/${TOPOLOGY.maxAttempts}), retrying in ${TOPOLOGY.retryDelayMs}ms: ${reason}`);
        retryLater(context);
      } else {
        this.logger.error(`Message ${task.messageId} failed ${attempt} times, dead-lettering: ${reason}`);
        await deadLetter(context, `retries-exhausted: ${reason}`);
      }
    }
  }

  // Poison messages: retrying can never fix them, so they go straight to the dead-letter queue.
  @EventPattern<string>(UNDECODABLE)
  async onUndecodable(@Payload() failure: DecodeFailure, @Ctx() context: RmqContext): Promise<void> {
    this.logger.warn(`Dead-lettering ${failure.reason} message: ${failure.error}`);
    await deadLetter(context, failure.reason);
  }
}
