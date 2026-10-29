import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('stats')
export class StatsController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  async stats() {
    // bigint columns come back as strings from pg (they can exceed Number's safe range); these
    // totals can't, so the casts to int are safe here.
    const [byProperty, byChannel, [processed]] = await Promise.all([
      this.db.query(
        `SELECT property_id AS "propertyId", currency, SUM(bookings)::int AS bookings, SUM(nights)::int AS nights,
                SUM(revenue_minor)::int AS "revenueMinor"
         FROM booking_stats GROUP BY property_id, currency ORDER BY property_id`,
      ),
      this.db.query(
        `SELECT channel, SUM(bookings)::int AS bookings FROM booking_stats GROUP BY channel ORDER BY channel`,
      ),
      this.db.query(`SELECT COUNT(*)::int AS count FROM processed_messages`),
    ]);
    return { byProperty, byChannel, processedMessages: processed.count };
  }
}
