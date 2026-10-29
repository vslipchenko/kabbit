import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingStats1761700000000 implements MigrationInterface {
  name = 'CreateBookingStats1761700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Every message already applied to the read model, so a redelivery changes nothing. Also
    // records where it came from, to see which partition carried which property.
    await queryRunner.query(`
      CREATE TABLE processed_messages (
        message_id   uuid        PRIMARY KEY,
        topic        text        NOT NULL,
        partition    integer     NOT NULL,
        "offset"     bigint      NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // The read model: derived entirely from Kafka, so it can be dropped and rebuilt by replaying.
    // Revenue is kept per currency: summing EUR and USD minor units would be meaningless.
    await queryRunner.query(`
      CREATE TABLE booking_stats (
        property_id   text    NOT NULL,
        channel       text    NOT NULL,
        currency      text    NOT NULL,
        bookings      integer NOT NULL,
        nights        integer NOT NULL,
        revenue_minor bigint  NOT NULL,
        PRIMARY KEY (property_id, channel, currency)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE booking_stats`);
    await queryRunner.query(`DROP TABLE processed_messages`);
  }
}
