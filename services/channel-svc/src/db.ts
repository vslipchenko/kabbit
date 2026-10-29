import pg from 'pg';

// Idempotent schema setup on startup. Enough for two small tables; Phase 4 brings real migrations.
const schema = `
  -- Which of our properties a channel's listing is. Each channel has its own ids for the same flat.
  CREATE TABLE IF NOT EXISTS listings (
    channel             text NOT NULL,
    external_listing_id text NOT NULL,
    property_id         text NOT NULL,
    PRIMARY KEY (channel, external_listing_id)
  );

  -- One row per booking a channel told us about: channels resend webhooks until they get a 2xx,
  -- so the same booking arriving again must not be published twice.
  CREATE TABLE IF NOT EXISTS received_bookings (
    channel                 text        NOT NULL,
    external_reservation_id text        NOT NULL,
    message_id              uuid        NOT NULL,
    received_at             timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (channel, external_reservation_id)
  );

  -- Demo data: the listings channel-simulator books. Six properties, because with 3 partitions,
  -- 3 keys happen to hash onto only 2 of them; these six reach every partition.
  INSERT INTO listings (channel, external_listing_id, property_id) VALUES
    ('airbnb', 'airbnb-1001', 'prop-1'), ('airbnb', 'airbnb-1002', 'prop-2'), ('airbnb', 'airbnb-1003', 'prop-3'),
    ('airbnb', 'airbnb-1004', 'prop-4'), ('airbnb', 'airbnb-1005', 'prop-5'), ('airbnb', 'airbnb-1006', 'prop-6'),
    ('booking', 'bk-501', 'prop-1'), ('booking', 'bk-502', 'prop-2'), ('booking', 'bk-503', 'prop-3'),
    ('booking', 'bk-504', 'prop-4'), ('booking', 'bk-505', 'prop-5'), ('booking', 'bk-506', 'prop-6')
  ON CONFLICT DO NOTHING;
`;

export async function connectDatabase(url: string): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query(schema);
  return pool;
}
