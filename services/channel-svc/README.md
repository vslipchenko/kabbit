# channel-svc (and channel-simulator)

Receives booking webhooks from the channels (Airbnb, Booking.com), normalizes them, and publishes
`ChannelReservationReceived` to Kafka. Phase 3 of [PLAN.md](../../PLAN.md).

```
channel-simulator ──signed webhook──▶ channel-svc ──▶ channel.reservations (3 partitions, key = propertyId)
 (fake Airbnb,                         │  verify HMAC signature
  fake Booking.com)                    │  adapter per channel → common booking
                                       │  listing id → propertyId (Postgres)
                                       └─ deduplicate by (channel, reservation id)
```

## Run

```sh
docker compose up -d --build channel-svc channel-simulator analytics-svc
curl -X POST "localhost:3011/simulate?count=10"
```

Simulator options: `count`, `channel=airbnb|booking|random`, `listing=airbnb-1001` (book one property
repeatedly), `duplicates=true` (send each webhook twice). Set `SIMULATE_EVERY_MS=2000` on the
simulator for a steady stream.

Messages are visible in Kafka UI at http://localhost:8080 (topic `channel.reservations`, including headers).

## What the code shows

- **Adapter pattern** (`src/channels/`): each channel has its own format. Airbnb sends money as
  `"375.50"` and splits the guest's name. Booking.com sends a float `375.5` and a numeric id. Both become
  one common booking, with money in integer minor units.
- **Webhook security** (`src/webhooks/signature.ts`): an HMAC over the *raw* bytes, compared in constant time.
- **Status codes as a contract**: `2xx` done, `4xx` don't resend (bad signature, invalid payload,
  unknown listing), `5xx` try again (Kafka or Postgres down). The simulator retries on `5xx` and network
  errors, the way real channels do.
- **Deduplication at two levels**: `received_bookings` answers a resent webhook with `200 duplicate`.
  The `messageId` is a UUIDv5 of channel + reservation id, so even an event published twice (a crash
  between the Kafka publish and the database commit) carries the same id, and consumers skip it.
- **A bounded publish**: with Kafka down, a webhook gets `503` after 10s instead of hanging for
  librdkafka's 5 minutes.

## Experiments

1. **Duplicates.** `curl -X POST "localhost:3011/simulate?count=5&duplicates=true"`: 5 × `202`, 5 × `200 duplicate`.
2. **Kafka outage.** `docker compose stop kafka`, then simulate one booking: `channel-svc` answers `503`
   after 10s and the simulator retries with backoff. `docker compose start kafka` while it's retrying:
   the booking gets through.
3. **Keys and partitions.** Simulate 30 bookings and check `partition` in the responses: one property
   always lands on the same partition, and partition 0 gets three of the six properties.
4. **Ordering per property.** `simulate?count=20&listing=airbnb-1001`: in Kafka UI, every message is on one
   partition, with increasing offsets.

## Known gaps (on purpose, fixed later)

- The Postgres transaction stays open during the Kafka publish. The transactional outbox (Phase 4)
  removes both that and the publish-then-crash window.
- Cancellations and changes are acknowledged and ignored (Phase 5).
