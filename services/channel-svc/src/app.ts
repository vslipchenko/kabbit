import express from 'express';
import type { Config } from './config.js';
import { webhookRouter } from './webhooks/router.js';

// Builds the app without starting it, so the wiring stays separate from listening and shutdown.
export function createApp(config: Config): express.Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    webhookRouter({
      secrets: { airbnb: config.AIRBNB_WEBHOOK_SECRET, booking: config.BOOKING_WEBHOOK_SECRET },
    }),
  );

  return app;
}
