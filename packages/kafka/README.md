# @kabbit/kafka

Shared Kafka producer and consumer for kabbit services, built on Confluent's
`@confluentinc/kafka-javascript` (librdkafka underneath, with a KafkaJS-compatible API).

```ts
const kafka = createKafka({ brokers: ['localhost:9094'], clientId: 'my-svc' });

const producer = new EnvelopeProducer(kafka, { deliveryTimeoutMs: 10_000 });
await producer.connect();
await producer.publish(TOPICS.channelReservations, propertyId, envelope); // key = propertyId

const consumer = await startEnvelopeConsumer({
  kafka, groupId: 'my-svc', topics: [TOPICS.channelReservations],
  definitions: [channelReservationReceivedV1], deadLetters: producer,
  handle: async (event, record) => { /* must be idempotent */ },
});
await consumer.stop();
```

## Producer guarantees

- `acks: -1` and `idempotent: true`: `publish` resolves only once the broker has stored the message;
  the producer's own retries never create duplicates or reorder a partition.
- Same key, same partition, in publish order. The hash is murmur2, as in Java's producer.
- `deliveryTimeoutMs` bounds how long `publish` keeps retrying (librdkafka's default is 5 minutes).
- Envelope metadata (`message-id`, `type`, `correlation-id`, `producer`) is copied into headers, so it
  shows up in Kafka UI.

## Consumer error model

A partition is an ordered log, and that drives everything:

| What happens | Consumer does | Why |
|---|---|---|
| Handler returns | Offset is stored and committed within 5s | At least once: a crash may redeliver up to 5s of messages |
| Message is malformed, invalid, or an unknown version | Sent to `<topic>.dlt`, consumption continues | Retrying can never fix it, and it would block the partition forever |
| Message type isn't in `definitions` | Skipped | Topics carry several types |
| Handler throws | Waits 1s, 2s, 4s … 30s, then the same message is redelivered | Assumed transient (database down); order is kept, lag grows, nothing is lost |

Only the failing partition waits. Others keep going, so a consumer with 3 partitions can show one stuck
and two healthy.

Compared with RabbitMQ (see `housekeeping-svc`): RabbitMQ can park one message in a retry queue and
deliver the next, because a queue promises no order between messages. Kafka can't skip ahead without
breaking per-key ordering, so it blocks the partition instead, or uses retry topics (Phase 7).

## Gotchas found while building this

- The client logs its own stack trace whenever a handler throws, on top of ours.
- `fromBeginning` and `autoCommit` are consumer-level settings, not per `subscribe`/`run` as in KafkaJS.
- The admin API has no "reset offsets"; replay deletes the group instead (see analytics-svc).
- The offset of a published message is in `baseOffset`, not `offset`.
- pnpm blocks install scripts, and this package's script downloads the native binary, so it's allowed in
  `pnpm-workspace.yaml`. Prebuilt binaries exist for Windows and for Alpine (musl).
