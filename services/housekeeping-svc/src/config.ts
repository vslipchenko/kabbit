import { z } from 'zod';

// Defaults point at the docker-compose infrastructure from the host. In a container, the
// compose file overrides the hosts (`rabbitmq`, `postgres`).
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3006),
  RABBITMQ_URL: z.string().default('amqp://kabbit:kabbit@localhost:5672'),
  DATABASE_URL: z.string().default('postgres://kabbit:kabbit@localhost:5433/housekeeping'),
  // Dev chaos knob: fraction (0..1) of task handling attempts that fail, to watch retries.
  SIMULATE_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type Env = z.infer<typeof envSchema>;

// Fails at startup, not at first use, when the environment is wrong.
export const validateEnv = (raw: Record<string, unknown>): Env => envSchema.parse(raw);
