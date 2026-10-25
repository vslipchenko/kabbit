import { z } from 'zod';
import { defineEvent, type EventOf } from '../envelope';
import { COMMAND_TYPES } from '../names';

export const housekeepingTaskKindSchema = z.enum(['cleaning']);

export type HousekeepingTaskKind = z.infer<typeof housekeepingTaskKindSchema>;

// A job for housekeeping, sent over RabbitMQ (routing key `housekeeping.task.<kind>`).
export const scheduleHousekeepingTaskPayloadSchema = z.object({
  propertyId: z.string().min(1),
  reservationId: z.string().min(1),
  kind: housekeepingTaskKindSchema,
  // Calendar date the task is due, usually the guest's checkout date.
  dueDate: z.iso.date(),
  notes: z.string().max(500).optional(),
});

export type ScheduleHousekeepingTaskPayload = z.infer<typeof scheduleHousekeepingTaskPayloadSchema>;

export const scheduleHousekeepingTaskV1 = defineEvent(
  COMMAND_TYPES.scheduleHousekeepingTask,
  1,
  scheduleHousekeepingTaskPayloadSchema,
);

export type ScheduleHousekeepingTask = EventOf<typeof scheduleHousekeepingTaskV1>;
