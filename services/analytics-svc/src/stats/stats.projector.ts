import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ChannelReservationReceived } from '@kabbit/contracts';
import type { ConsumedRecord } from '@kabbit/kafka';

const DAY_MS = 86_400_000;

// A projection: folds events into a read model shaped for the questions analytics asks. Raw SQL
// rather than entities, because the work is upserts and increments, which SQL says directly.
@Injectable()
export class StatsProjector {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // Returns false for a message that was already applied. Recording the messageId and updating
  // the totals in one transaction gives exactly-once *effects* on top of Kafka's at-least-once
  // *delivery*: either both happen, or neither does and the redelivery applies it.
  async apply(event: ChannelReservationReceived, record: ConsumedRecord): Promise<boolean> {
    const { payload } = event;
    const nights = Math.round((Date.parse(payload.checkOut) - Date.parse(payload.checkIn)) / DAY_MS);

    return this.db.transaction(async (tx) => {
      const claimed: unknown[] = await tx.query(
        `INSERT INTO processed_messages (message_id, topic, partition, "offset") VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING RETURNING message_id`,
        [event.messageId, record.topic, record.partition, record.offset],
      );
      if (claimed.length === 0) return false;

      await tx.query(
        `INSERT INTO booking_stats (property_id, channel, currency, bookings, nights, revenue_minor)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (property_id, channel, currency) DO UPDATE SET
           bookings      = booking_stats.bookings + 1,
           nights        = booking_stats.nights + EXCLUDED.nights,
           revenue_minor = booking_stats.revenue_minor + EXCLUDED.revenue_minor`,
        [payload.propertyId, payload.channel, payload.currency, nights, payload.amount],
      );
      return true;
    });
  }
}
