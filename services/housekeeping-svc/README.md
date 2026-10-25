# housekeeping-svc

NestJS service that consumes housekeeping task commands from RabbitMQ (through Nest's RMQ
transport) and stores them in Postgres. Phase 2 of [PLAN.md](../../PLAN.md).

```
ops (topic) --housekeeping.task.*--> housekeeping.tasks --> TasksConsumer --> Postgres
                                         │  ▲
                        nack (transient) │  │ TTL 5s
                                         ▼  │
                                 housekeeping.tasks.retry

poison message / 5th failed attempt --> housekeeping.tasks.dlq
```

## Run

In Docker, with everything else:

```sh
docker compose up -d --build housekeeping-svc
```

Or on the host, for a faster edit loop (stop the container first, or the two will share the queue):

```sh
pnpm --filter @kabbit/contracts build
pnpm --filter @kabbit/housekeeping-svc build
pnpm --filter @kabbit/housekeeping-svc start
```

Run it through `tsc` and `node`, never `tsx`: esbuild doesn't emit decorator metadata, so Nest's
dependency injection breaks.

| | |
|---|---|
| Tasks | http://localhost:3006/tasks |
| Health | http://localhost:3006/health |
| Queues | http://localhost:15672/#/queues (kabbit / kabbit) |

Send tasks with the dev publisher, which stands in for ops-dispatcher until Phase 1:

```sh
pnpm --filter @kabbit/housekeeping-svc publish-task --count 10
pnpm --filter @kabbit/housekeeping-svc publish-task --kind duplicate   # same message twice
pnpm --filter @kabbit/housekeeping-svc publish-task --kind invalid     # bad payload
pnpm --filter @kabbit/housekeeping-svc publish-task --kind malformed   # not JSON
pnpm --filter @kabbit/housekeeping-svc publish-task --kind v2          # unknown version
```

## Experiments

1. **Idempotency.** Publish `--kind duplicate`. The log shows one "Scheduled" and one "Duplicate";
   `/tasks` has one row.
2. **Poison messages.** Publish `invalid`, `malformed` and `v2`. Each goes straight to
   `housekeeping.tasks.dlq`, without retries. In the management UI, use "Get messages" on the dead-letter
   queue and read the `x-dead-letter-reason` header.
3. **A transient failure.** `docker compose stop postgres`, publish a task, and watch it retry every
   5s. Then `docker compose start postgres` before the fifth attempt: it gets stored, and nothing is lost.
4. **Retries exhausted.** Run with `SIMULATE_FAILURE_RATE=1`. After 5 attempts, the message lands in
   the dead-letter queue with reason `retries-exhausted`. Try `0.5` to see some messages succeed on a later attempt.
5. **Crash before the ack.** Publish `--count 200` and kill the service mid-flight. Unacked messages
   return to the queue and are processed after a restart. Idempotency means no task is stored twice.
6. **Competing consumers.** Run the container *and* a host instance; messages are split between them.

## Nest transport vs. raw amqplib: what this phase shows

- **Nest's message format.** The RMQ transport expects a `{ pattern, data }` body. A custom
  deserializer (`messaging/envelope.deserializer.ts`) maps the kabbit envelope's `type` to the pattern.
- **Topology is ours.** Nest can bind one exchange, but not this retry and dead-letter setup, so
  `messaging/topology.ts` declares it with amqplib and Nest gets `noAssert: true`.
- **No handler means a nack without requeue,** which our retry setup would turn into an infinite loop. So
  undecodable messages get their own pattern and handler.
- **A thrown error is only logged.** The message stays unacked, and enough stuck messages fill the
  prefetch window and stall the consumer. Every handler ends in an explicit ack, retry, or dead-letter
  (`messaging/acknowledgements.ts`).
- **What Nest gives you:** routing by decorator, dependency injection, one app serving both HTTP and RabbitMQ,
  and reconnects through amqp-connection-manager.
- **Verdict:** the framework works well for consumers; anything about topology or retries needs the raw client.
