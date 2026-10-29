import { SERVICES } from '@kabbit/contracts';
import { createKafka, EnvelopeProducer } from '@kabbit/kafka';
import { createApp } from './app.js';
import { BookingIngestor } from './bookings/ingest.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './db.js';

const config = loadConfig();
const pool = await connectDatabase(config.DATABASE_URL);
const producer = new EnvelopeProducer(createKafka({ brokers: config.KAFKA_BROKERS, clientId: SERVICES.channelSvc }), {
  // A channel waiting on the webhook response gives up after a few seconds; fail before it does,
  // with a 503 it will retry.
  deliveryTimeoutMs: 10_000,
});
await producer.connect();

const server = createApp(config, new BookingIngestor(pool, producer)).listen(config.PORT, () => {
  console.log(`channel-svc listening on :${config.PORT}`);
});

// docker stop sends SIGTERM: stop accepting requests, finish the ones in flight, then close
// connections in reverse order. Without this, a request mid-way could be cut off after the
// channel already sent it.
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await producer.disconnect();
    await pool.end();
    process.exit(0);
  });
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
