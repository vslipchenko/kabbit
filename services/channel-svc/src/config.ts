import { z } from 'zod';

// Defaults point at the docker-compose infrastructure from the host; compose overrides them.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().default('postgres://kabbit:kabbit@localhost:5433/channel'),
  KAFKA_BROKERS: z
    .string()
    .default('localhost:9094')
    .transform((brokers) => brokers.split(',')),
  // Shared secrets the channels sign their webhooks with (in reality, issued by each channel).
  AIRBNB_WEBHOOK_SECRET: z.string().min(16).default('dev-airbnb-webhook-secret'),
  BOOKING_WEBHOOK_SECRET: z.string().min(16).default('dev-booking-webhook-secret'),
});

export type Config = z.infer<typeof envSchema>;

// Fails at startup, not at first use, when the environment is wrong.
export const loadConfig = (): Config => envSchema.parse(process.env);
