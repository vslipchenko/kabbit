import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ScheduleHousekeepingTask } from '@kabbit/contracts';
import { HousekeepingTask } from './housekeeping-task.entity.js';

@Injectable()
export class TasksService {
  constructor(@InjectRepository(HousekeepingTask) private readonly tasks: Repository<HousekeepingTask>) {}

  // Returns false when this command was already stored (a redelivery). Insert-or-ignore in one
  // statement, rather than "select, then insert": two consumers handling the same redelivered
  // message at once would both pass the select.
  async schedule(command: ScheduleHousekeepingTask): Promise<boolean> {
    const { payload } = command;
    const result = await this.tasks
      .createQueryBuilder()
      .insert()
      .values({
        sourceMessageId: command.messageId,
        correlationId: command.correlationId,
        propertyId: payload.propertyId,
        reservationId: payload.reservationId,
        kind: payload.kind,
        dueDate: payload.dueDate,
        notes: payload.notes ?? null,
      })
      .orIgnore()
      .returning(['id'])
      .execute();
    return result.raw.length > 0;
  }

  findRecent(limit = 100): Promise<HousekeepingTask[]> {
    return this.tasks.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
