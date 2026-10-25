# Kabbit — Vacation Rental Platform (Kafka + RabbitMQ microservices)

A hands-on project for learning how microservices communicate through **Kafka** and **RabbitMQ**.
It simulates work on a **property management system (PMS) for Airbnb and vacation rentals**:
bookings from several channels go into one system, which has real business logic and payments.

## Tech stack (deliberately minimal)

| Layer | Technology |
|---|---|
| Services | **Node.js 22 + TypeScript**, **NestJS** and **Express** |
| Messaging | **Kafka** (domain events), **RabbitMQ** (jobs/tasks) |
| Database | **PostgreSQL** (one instance, a separate database per service) |
| Client | **React + TypeScript** (Vite) — optional, built last |
| Runtime | **Docker Compose** |

Libraries:
- NestJS: `@nestjs/microservices` (Kafka + RMQ transports), `@nestjs/typeorm` (or Prisma), `class-validator`
- Express: Express 5, `zod`, and the raw broker clients:
  - Kafka: `@confluentinc/kafka-javascript` (official, KafkaJS-compatible API)
  - RabbitMQ: `amqplib` + `amqp-connection-manager`
- Postgres: `pg` (Express services), TypeORM/Prisma (NestJS services)
- Tests: Jest/Vitest, Supertest, Testcontainers (real Kafka/RabbitMQ/Postgres in integration tests)
- Monorepo: pnpm workspaces

> NestJS's Kafka transport uses KafkaJS internally, while the Express services use the raw Confluent client.
> That's intentional: you learn both the framework abstraction and what's under it.

### Why Postgres is needed

Postgres is what makes the messaging integration *correct*, not just working:

- **Transactional outbox:** save business data and the outgoing event in one transaction, then relay the event to Kafka or RabbitMQ.
  Without it, a crash between "save" and "publish" loses or duplicates events.
- **Idempotent consumers:** a `processed_messages` table with a unique `message_id`. Kafka and RabbitMQ both deliver
  *at least once*, so duplicates will happen.
- **Double-booking prevention:** an exclusion constraint on the reservation's date range.
- **Read models:** analytics tables built from Kafka events, which can be rebuilt by replaying the topic.

### Is the React client a must?

No. All the Kafka and RabbitMQ learning happens on the backend; you can drive it with HTTP calls (`.http` files or
curl) and watch Kafka UI and the RabbitMQ management UI. A small dashboard is still worth building at the end because:
it makes the asynchronous flow visible (live updates via Server-Sent Events), and it rounds out the
full-stack experience. It is the last phase and can be skipped.

## Architecture

```
          ┌────────────────────────────┐
          │ dashboard (React, optional)│
          └─────────────┬──────────────┘
                        │ REST + SSE
          ┌─────────────▼──────────────┐
          │ gateway (Express)          │  routing, validation, SSE fan-out of events
          └───┬───────────────┬────────┘
              │               │
     ┌────────▼───────┐ ┌─────▼──────────────┐
     │ property-svc   │ │ reservation-svc    │
     │ (NestJS, PG)   │ │ (NestJS, PG,       │
     └────────┬───────┘ │ outbox, exclusion  │
              │         │ constraint)        │
              │         └─────┬──────────────┘
 mock Airbnb ─┐               │
 mock Booking ┤ webhooks      │
              ▼               │
     ┌────────────────┐       │
     │ channel-svc    │       │
     │ (Express, PG)  │       │
     └───────┬────────┘       │
═════════════╪════════════════╪═══ KAFKA (domain events) ═════════════════════════
  topics: channel.reservations · reservations · payments · calendar · properties
════╤═══════════════╤═══════════════╤══════════════════╤══════════════════════════
    │               │               │                  │
┌───▼─────────┐ ┌───▼──────────┐ ┌──▼──────────┐ ┌─────▼───────────┐
│ payment-svc │ │ analytics-svc│ │ channel-svc │ │ ops-dispatcher  │
│ (NestJS, PG,│ │ (NestJS, PG  │ │ pushes      │ │ (Express)       │
│ outbox,     │ │ read models, │ │ availability│ │ Kafka → RabbitMQ│
│ ledger)     │ │ replay)      │ │ to channels │ └────────┬────────┘
└─────────────┘ └──────────────┘ └─────────────┘          │
══════════════════════════════════ RABBITMQ (jobs/tasks) ═╪═══════════════════════
  exchange: ops (topic)   routing: guest.message.* · housekeeping.task.*   + retries, DLX
══════════════════════════════════════════════╤═══════════╪═══════════════════════
                                    ┌─────────▼────┐ ┌────▼───────────────┐
                                    │ messaging-   │ │ housekeeping-svc   │
                                    │ worker       │ │ (NestJS RMQ        │
                                    │ (Express +   │ │ transport, PG)     │
                                    │ amqplib)     │ └────────────────────┘
                                    └──────────────┘
```

### Main business flow

1. A guest books on **mock Airbnb**, which sends a webhook in Airbnb's own payload format to `channel-svc`.
2. `channel-svc` deduplicates the webhook (unique key in Postgres), **normalizes** the payload into the
   canonical model (Adapter pattern, one adapter per channel) and publishes `ChannelReservationReceived` to Kafka
   (key = `propertyId`, so all events for one property stay in order).
3. `reservation-svc` checks availability. A Postgres exclusion constraint on `daterange` makes double bookings
   impossible, even under concurrency. It applies pricing rules (Strategy pattern) and, through the outbox,
   publishes `ReservationConfirmed` or `ReservationRejected`.
4. `payment-svc` charges the guest through a mock payment provider: idempotency keys, ledger entries, outbox.
   It publishes `PaymentSucceeded` or `PaymentFailed`. On failure, `reservation-svc` cancels the reservation
   (a choreography saga with compensation).
5. `channel-svc` consumes `CalendarBlocked` and **pushes availability** to the *other* channel, so the same
   dates can't be sold twice.
6. `ops-dispatcher` turns events into **jobs** on RabbitMQ: a guest welcome message, a delayed check-in reminder,
   and a cleaning task after checkout.
7. `analytics-svc` builds read models (occupancy, revenue per property and channel) and can **replay** the
   whole Kafka history to rebuild them from scratch.

### Why each broker is used where it is

| | **Kafka** | **RabbitMQ** |
|---|---|---|
| Model | Distributed, append-only **log** | **Queue** with smart routing |
| After consumption | Kept (retention); can be **replayed** | Removed once acked |
| Best for | Domain events, many independent readers, rebuilding read models | Background jobs, routing, retries, delays, request/reply |
| Scaling | Partitions + consumer groups | Competing consumers |
| Ordering | Per partition (key = `propertyId`) | Per queue |
| In this project | Reservation, payment and calendar events | Guest messages, housekeeping tasks |

## Services

| Service | Framework | Messaging | Key learning |
|---|---|---|---|
| `gateway` | Express | Kafka consumer (for SSE) | Middleware, validation, proxying, SSE |
| `property-svc` | NestJS | Kafka producer | Modules, DI, TypeORM, outbox |
| `reservation-svc` | NestJS | Kafka (Nest transport) | Business rules, concurrency, saga |
| `payment-svc` | NestJS | Kafka (Nest transport) | Idempotency, ledger, refunds |
| `analytics-svc` | NestJS | Kafka consumer group | Projections, offset reset and replay |
| `channel-svc` | Express | Kafka (raw client) | Webhooks, adapters, data transformation |
| `channel-simulator` | Express | — | Fake Airbnb/Booking.com; generates bookings, injects duplicates and failures |
| `ops-dispatcher` | Express | Kafka → RabbitMQ (raw clients) | Bridging brokers, publisher confirms |
| `messaging-worker` | Express (health endpoint) | RabbitMQ (`amqplib`) | Acks, prefetch, retries, DLQ |
| `housekeeping-svc` | NestJS | RabbitMQ (Nest RMQ transport) | Nest microservice transport vs. raw client |
| `dashboard` | React + TS | — | Optional: live view of the system |

All services with state use the shared Postgres instance, each with its **own database**. Services never read
each other's tables; they communicate only through HTTP, Kafka and RabbitMQ.

## Infrastructure (docker-compose)

- Kafka (KRaft mode, `apache/kafka`) + **Kafka UI** (`provectuslabs/kafka-ui`)
- RabbitMQ with the management plugin (`rabbitmq:4-management`), UI at `localhost:15672`
- PostgreSQL 16 (an init script creates one database per service)
- One shared multi-stage `Dockerfile` for all Node services, `node:22-alpine` runtime image

## Repository layout

```
kabbit/
├── docker-compose.yml
├── Dockerfile
├── pnpm-workspace.yaml
├── infra/postgres/init.sql      # one database per service
├── packages/
│   ├── contracts/      # event types + zod schemas, topic/exchange/queue names, versions
│   ├── kafka/          # producer/consumer helpers for the Express services
│   ├── rabbit/         # connection, topology declaration, retry helpers
│   └── outbox/         # reusable outbox table + relay
├── services/
│   ├── gateway/            (Express)
│   ├── property-svc/       (NestJS)
│   ├── reservation-svc/    (NestJS)
│   ├── payment-svc/        (NestJS)
│   ├── analytics-svc/      (NestJS)
│   ├── channel-svc/        (Express)
│   ├── channel-simulator/  (Express)
│   ├── ops-dispatcher/     (Express)
│   ├── messaging-worker/   (Express)
│   └── housekeeping-svc/   (NestJS)
├── apps/dashboard/         (React + TS, optional)
├── http/                   # .http request files for manual testing
└── docs/runbooks/          # "what to do when…" notes
```

## Learning roadmap

Every phase ends with something you can run. The **experiments** are where most of the learning happens.

### Phase 0 — Foundations (1–2 days)
- pnpm monorepo, shared TypeScript config, ESLint/Prettier, `contracts` package.
- `docker-compose.yml` with Kafka, Kafka UI, RabbitMQ and Postgres; open both broker UIs.
- Crash course if needed: Express middleware model; NestJS modules, providers, DI, pipes, guards, interceptors.

### Phase 1 — RabbitMQ with Express (2 days)
- `ops-dispatcher` publishes and `messaging-worker` consumes with raw `amqplib` (the trigger is a simple HTTP endpoint for now).
- Manual acks, prefetch, durable queues, persistent messages, publisher confirms.
- Topic exchange, retries with delay (TTL queue), dead-letter exchange, max attempts.
- **Experiments:** kill a worker mid-message; run 3 workers; flood the queue and watch the backlog drain.

### Phase 2 — RabbitMQ with NestJS (1 day)
- `housekeeping-svc` uses the Nest RMQ transport (`@EventPattern`, manual ack via `RmqContext`), and stores tasks in Postgres.
- Compare: what Nest hides, and what you lose (custom exchanges, retry topology).

### Phase 3 — Kafka core (2–3 days)
- `channel-svc` + `channel-simulator`: webhooks → normalize → publish with key `propertyId`.
- Topics with several partitions; consumer groups; manual offset commits; at-least-once delivery.
- `analytics-svc` as a second, independent consumer group; reset its offsets to replay.
- **Experiments:** scale a consumer to 3 replicas and watch rebalancing; stop a consumer, build up lag, and watch it
  catch up; prove that per-property ordering holds.

### Phase 4 — Postgres + messaging integration (3–4 days)
- `property-svc` and `reservation-svc` with migrations and transactions.
- **Transactional outbox** + relay (polling; optionally `LISTEN/NOTIFY` to cut latency).
- **Idempotent consumers** with a `processed_messages` table.
- Double-booking prevention with an exclusion constraint; test with many concurrent requests.
- Pricing rules with the Strategy pattern.
- **Experiments:** crash a service between the DB write and the publish (outbox saves you); replay duplicate messages
  (idempotency saves you).

### Phase 5 — Payments and sagas (3 days)
- `payment-svc`: idempotency keys, a double-entry ledger table, refunds on cancellation.
- Choreography saga with compensation across reservation and payment.
- Availability push back to the other channel (`CalendarBlocked`).
- `ops-dispatcher` now consumes real Kafka events and produces RabbitMQ jobs (guest messages, delayed reminders, cleaning tasks).

### Phase 6 — Gateway and React dashboard (optional, 3–4 days)
- Express gateway: request validation, request IDs, routing, an SSE stream of live events.
- React + TS dashboard: multi-channel calendar, reservations table, payments, housekeeping board, a live event feed.

### Phase 7 — Production readiness (ongoing)
- Structured logs (pino) with a **correlation ID** propagated through HTTP headers, Kafka headers and AMQP properties.
- Health/readiness endpoints, graceful shutdown (finish in-flight messages, commit offsets, close channels).
- Retries with backoff for calls to the channel APIs; Kafka retry topics and a dead-letter topic.
- Event schema versioning: add a field without breaking consumers.
- Integration tests with Testcontainers.
- **Failure drills:** stop Kafka, RabbitMQ or Postgres mid-flow; make the simulator send malformed or duplicate
  webhooks; diagnose with logs and the broker UIs only. Write down what you did in `docs/runbooks/`.

## Definition of done

- `docker compose up --build` starts the whole platform.
- The simulator generates bookings on two channels, and they flow through to reservations, payments and tasks.
- No double bookings under concurrent load; duplicate messages have no effect.
- Killing any service or broker and restarting it loses no data.
- Analytics can be rebuilt from scratch by replaying Kafka.
- You can explain, in your own words: Kafka vs. RabbitMQ, Express vs. NestJS trade-offs, why the outbox exists,
  and how you'd debug a stuck consumer or a growing dead-letter queue.
