import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3011),
  // Where the channels deliver webhooks: kabbit's channel-svc.
  CHANNEL_SVC_URL: z.url().default('http://localhost:3010'),
  // Must match channel-svc's secrets; in reality each channel issues one when you connect.
  AIRBNB_WEBHOOK_SECRET: z.string().min(16).default('dev-airbnb-webhook-secret'),
  BOOKING_WEBHOOK_SECRET: z.string().min(16).default('dev-booking-webhook-secret'),
  // > 0: also send one random booking every this many milliseconds, for a steady stream.
  SIMULATE_EVERY_MS: z.coerce.number().int().nonnegative().default(0),
});

export type Config = z.infer<typeof envSchema>;

export const loadConfig = (): Config => envSchema.parse(process.env);
