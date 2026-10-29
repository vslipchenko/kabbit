import express from 'express';
import { z } from 'zod';
import { CHANNELS, randomBooking, type ChannelName, type Webhook } from './bookings.js';
import { loadConfig } from './config.js';
import { deliver } from './delivery.js';

const config = loadConfig();
const secrets: Record<ChannelName, string> = {
  airbnb: config.AIRBNB_WEBHOOK_SECRET,
  booking: config.BOOKING_WEBHOOK_SECRET,
};

const send = (webhook: Webhook) => deliver(webhook, config.CHANNEL_SVC_URL, secrets[webhook.channel]);
const pickChannel = (channel: ChannelName | 'random'): ChannelName =>
  channel === 'random' ? CHANNELS[Math.floor(Math.random() * CHANNELS.length)]! : channel;

// Query parameters rather than a JSON body, so it's easy to call from any shell:
//   curl -X POST "localhost:3011/simulate?count=10&channel=booking&duplicates=true"
const simulateQuery = z.object({
  count: z.coerce.number().int().min(1).max(1000).default(1),
  channel: z.enum(['airbnb', 'booking', 'random']).default('random'),
  // Book this listing every time (e.g. airbnb-1001), to send many bookings for one property.
  listing: z.string().optional(),
  // Send every webhook twice, like a channel that didn't see the first response.
  duplicates: z.stringbool().default(false),
});

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/simulate', async (req, res) => {
  const query = simulateQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: z.prettifyError(query.error) });
    return;
  }
  const { count, channel, listing, duplicates } = query.data;

  const results = [];
  // One at a time, in order: per-property ordering downstream is easier to see that way.
  for (let i = 0; i < count; i++) {
    const webhook = randomBooking(pickChannel(channel), listing);
    results.push(await send(webhook));
    if (duplicates) results.push(await send(webhook));
  }

  const summary: Record<string, number> = {};
  for (const result of results) summary[result.status] = (summary[result.status] ?? 0) + 1;
  res.json({ summary, results });
});

app.listen(config.PORT, () => {
  console.log(`channel-simulator listening on :${config.PORT}, delivering to ${config.CHANNEL_SVC_URL}`);
});

if (config.SIMULATE_EVERY_MS > 0) {
  setInterval(() => {
    void send(randomBooking(pickChannel('random'))).then((result) =>
      console.log(`${result.channel} ${result.reservationId}: ${result.status}`),
    );
  }, config.SIMULATE_EVERY_MS);
}
