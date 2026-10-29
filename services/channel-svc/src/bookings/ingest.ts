import type pg from 'pg';
import { channelReservationReceivedV1, createEnvelope, SERVICES, TOPICS, type Channel } from '@kabbit/contracts';
import type { EnvelopeProducer } from '@kabbit/kafka';
import type { ChannelBooking } from '../channels/index.js';
import { bookingMessageId } from './message-id.js';

export class UnknownListingError extends Error {
  constructor(channel: Channel, listingId: string) {
    super(`No property mapped to ${channel} listing ${listingId}`);
  }
}

export type IngestResult =
  | { status: 'published'; messageId: string; propertyId: string; partition: number; offset: string | undefined }
  | { status: 'duplicate'; messageId: string };

export class BookingIngestor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly producer: EnvelopeProducer,
  ) {}

  // Records the booking and publishes it, all or nothing: if the publish fails, the transaction
  // rolls back, the webhook gets a 5xx, and the channel's retry starts over cleanly.
  //
  // Known gap, fixed by the transactional outbox in Phase 4: a crash after the publish but before
  // the COMMIT. The retried webhook publishes the booking again, but with the same deterministic
  // messageId, so consumers that deduplicate by messageId still count it once. (Holding a
  // transaction open across a network call is also what the outbox removes.)
  async ingest(channel: Channel, booking: ChannelBooking, correlationId: string): Promise<IngestResult> {
    const messageId = bookingMessageId(channel, booking.externalReservationId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const listing = await client.query<{ property_id: string }>(
        'SELECT property_id FROM listings WHERE channel = $1 AND external_listing_id = $2',
        [channel, booking.externalListingId],
      );
      const propertyId = listing.rows[0]?.property_id;
      if (!propertyId) throw new UnknownListingError(channel, booking.externalListingId);

      // Claims the booking. On a concurrent duplicate, the second INSERT waits for the first
      // transaction, then inserts nothing.
      const claimed = await client.query(
        `INSERT INTO received_bookings (channel, external_reservation_id, message_id) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [channel, booking.externalReservationId, messageId],
      );
      if (claimed.rowCount === 0) {
        await client.query('ROLLBACK');
        return { status: 'duplicate', messageId };
      }

      const event = createEnvelope(
        channelReservationReceivedV1,
        {
          propertyId,
          channel,
          guest: booking.guest,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          amount: booking.amount,
          currency: booking.currency,
        },
        { correlationId, producer: SERVICES.channelSvc, messageId },
      );
      // Key = propertyId: every event for one property lands on one partition, in order.
      const metadata = await this.producer.publish(TOPICS.channelReservations, propertyId, event);

      await client.query('COMMIT');
      return { status: 'published', messageId, propertyId, partition: metadata.partition, offset: metadata.baseOffset };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
