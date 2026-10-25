import { z } from 'zod';
import { channelReservationReceivedSchema, EVENT_TYPES, type ChannelReservationReceived } from '@kabbit/contracts';

const valid: ChannelReservationReceived = {
  messageId: '0b9e6f2c-6a8e-4c1f-9d3a-2f6b7c8d9e01',
  type: EVENT_TYPES.channelReservationReceived,
  version: 1,
  occurredAt: '2026-10-25T10:00:00Z',
  correlationId: 'req-1',
  payload: {
    propertyId: 'prop-1',
    channel: 'airbnb',
    guest: { name: 'Ana', email: 'ana@example.com' },
    checkIn: '2026-11-01',
    checkOut: '2026-11-04',
    amount: 37500, // 375.00 EUR
    currency: 'EUR',
  },
};

// Untyped on purpose: this is what arrives from the wire.
const invalid: unknown = {
  ...valid,
  messageId: 'not-a-uuid',
  payload: {
    ...valid.payload,
    channel: 'vrbo',
    guest: { name: 'Ana', email: 'ana-at-example.com' },
    amount: 375.5,
    currency: 'eur',
  },
};

const parsed = channelReservationReceivedSchema.parse(valid);
console.log('valid: parsed', parsed.type, 'for', parsed.payload.propertyId);

try {
  channelReservationReceivedSchema.parse(invalid);
} catch (err) {
  if (!(err instanceof z.ZodError)) throw err;
  console.error('invalid: rejected\n' + z.prettifyError(err));
}
