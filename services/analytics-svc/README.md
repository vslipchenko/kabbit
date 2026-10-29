# analytics-svc

NestJS service that consumes `channel.reservations` as its own consumer group and keeps a read model in
Postgres: bookings, nights and revenue per property, channel and currency. Phase 3 of
[PLAN.md](../../PLAN.md).

- `GET http://localhost:3020/stats`: the read model
- Consumer group `analytics-svc`, starting from the oldest message the first time it runs
- Each message is applied exactly once: its `messageId` goes into `processed_messages` in the same
  transaction as the stats update, so a redelivery changes nothing

NestJS 12's built-in Kafka transport uses `kafkajs`, which is no longer maintained, so the consumer from
`@kabbit/kafka` runs inside a provider (`src/stats/reservations.consumer.ts`), started and stopped by
Nest lifecycle hooks.

## Experiments

Inspect the group at any point:

```sh
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group analytics-svc --members --verbose
```

(From Git Bash, prefix `MSYS_NO_PATHCONV=1`, or the `/opt/...` path gets rewritten.)

1. **Scaling and rebalancing.** `docker compose up -d --scale analytics-svc=3 analytics-svc`: each
   replica gets one partition (ports 3020–3022). Scale to 4: one replica has 0 partitions and sits idle.
   Simulate 18 bookings and compare `docker logs kabbit-analytics-svc-N`: the replica holding partition 0
   does most of the work. Partitions spread keys, not load.
2. **Lag.** `docker compose stop analytics-svc`, simulate 30 bookings, and describe the group: LAG is 30.
   Start the service again and watch the lag drain.
3. **Blocking retries.** Run with `SIMULATE_FAILURE_RATE=0.3` (set in compose, or on the host). A failing
   message is retried with growing backoff, and *only its partition* waits; the others keep going.
   Offsets within a partition are always applied in order.
4. **Duplicates.** Publish the same envelope twice (or replay without truncating): "Duplicate, skipped".
5. **Replay.** Rebuild the read model from Kafka:
   ```sh
   docker compose stop analytics-svc
   pnpm --filter @kabbit/analytics-svc replay   # refuses while any instance is still in the group
   docker compose start analytics-svc
   ```
   `/stats` comes back identical. Only Kafka can do this: RabbitMQ deletes a message once it's acked.
   Note: a killed (not stopped) consumer stays in the group until its session times out (~45s), and
   messages that were dead-lettered are dead-lettered again on every replay.
6. **The dead-letter topic.**
   ```sh
   docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 \
     --topic channel.reservations.dlt --from-beginning --property print.headers=true
   ```

## Worth noticing

- After a rebuild, the first replica to join takes every partition until the others arrive. A small
  backlog is finished before the rebalance even happens.
- TypeORM takes no lock while migrating, so replicas started at the same moment can race on the first
  migration. Compose's `restart: on-failure` covers it here; in production, migrate as a separate step.
