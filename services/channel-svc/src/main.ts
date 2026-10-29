import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './db.js';

const config = loadConfig();
const pool = await connectDatabase(config.DATABASE_URL);

const server = createApp().listen(config.PORT, () => {
  console.log(`channel-svc listening on :${config.PORT}`);
});

// docker stop sends SIGTERM: stop accepting requests, finish the ones in flight, then close
// connections. Without this, a request mid-way could be cut off after the channel already sent it.
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
