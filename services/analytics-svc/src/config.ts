import { z } from 'zod';

// Defaults point at the docker-compose infrastructure from the host; compose overrides them.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3005),
  DATABASE_URL: z.string().default('postgres://kabbit:kabbit@localhost:5433/analytics'),
  KAFKA_BROKERS: z
    .string()
    .default('localhost:9094')
    .transform((brokers) => brokers.split(',')),
  // Every instance with this id shares the work: Kafka splits the partitions between them.
  KAFKA_GROUP_ID: z.string().default('analytics-svc'),
  // Dev chaos knob: fraction (0..1) of messages whose handling fails, to watch Kafka retries.
  SIMULATE_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type Env = z.infer<typeof envSchema>;

// Fails at startup, not at first use, when the environment is wrong.
export const validateEnv = (raw: Record<string, unknown>): Env => envSchema.parse(raw);
