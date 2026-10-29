import express from 'express';

// Builds the app without starting it, so the wiring stays separate from listening and shutdown.
export function createApp(): express.Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
