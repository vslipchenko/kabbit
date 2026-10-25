import { randomUUID } from 'node:crypto';
import {
  causedBy,
  channelReservationReceivedV1,
  createDecoder,
  createEnvelope,
  EVENT_TYPES,
  SERVICES,
  type ChannelReservationReceived,
} from '@kabbit/contracts';

// 1. Producing: createEnvelope fills in messageId and occurredAt and validates the result.
const event: ChannelReservationReceived = createEnvelope(
  channelReservationReceivedV1,
  {
    propertyId: 'prop-1',
    channel: 'airbnb',
    guest: { name: 'Ana', email: 'ana@example.com' },
    checkIn: '2026-11-01',
    checkOut: '2026-11-04',
    amount: 37500, // 375.00 EUR
    currency: 'EUR',
  },
  { correlationId: randomUUID(), producer: SERVICES.scratch },
);
console.log('created:', event.type, event.messageId);

// A follow-up message keeps the correlation and points at its cause.
const followUp = causedBy(event, SERVICES.scratch);
console.log('caused by:', followUp.causationId === event.messageId, 'same correlation:', followUp.correlationId === event.correlationId);

// 2. A producer can't build an invalid message: createEnvelope throws.
try {
  createEnvelope(
    channelReservationReceivedV1,
    { ...event.payload, amount: 375.5 },
    { correlationId: randomUUID(), producer: SERVICES.scratch },
  );
} catch {
  console.log('createEnvelope rejected a float amount');
}

// 3. Consuming: the decoder sorts every raw message into one outcome.
const decode = createDecoder([channelReservationReceivedV1]);
const wire = (message: object) => Buffer.from(JSON.stringify(message)); // what a broker hands you

const cases: Record<string, string | Uint8Array> = {
  'valid': wire(event),
  'not JSON': 'hello',
  'not an envelope': wire({ hello: 'world' }),
  'bad payload': wire({ ...event, payload: { ...event.payload, channel: 'vrbo', currency: 'eur' } }),
  'newer version': wire({ ...event, version: 2 }),
  'other type': wire({ ...event, type: 'reservation.confirmed' }),
};

for (const [name, raw] of Object.entries(cases)) {
  const result = decode(raw);
  if (result.ok) {
    // `result.event` is fully typed: switch on type to handle each message kind.
    switch (result.event.type) {
      case EVENT_TYPES.channelReservationReceived:
        console.log(`${name}: ok, property ${result.event.payload.propertyId}`);
    }
  } else {
    console.log(`${name}: ${result.reason}\n  ${result.error.replaceAll('\n', '\n  ')}`);
  }
}
