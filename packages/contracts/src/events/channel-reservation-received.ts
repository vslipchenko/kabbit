import { z } from 'zod';
import { envelopeSchema } from '../envelope';
import { amountMinorSchema, currencySchema } from '../money';
import { EVENT_TYPES } from '../names';

export const channelSchema = z.enum(['airbnb', 'booking']);

export type Channel = z.infer<typeof channelSchema>;

export const channelReservationReceivedPayloadSchema = z
  .object({
    propertyId: z.string().min(1),
    channel: channelSchema,
    guest: z.object({
      name: z.string().min(1),
      email: z.email(),
    }),
    // Calendar dates (YYYY-MM-DD), not instants: a night belongs to the property's local date.
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    // Total price in minor units, e.g. 12550 = 125.50 EUR.
    amount: amountMinorSchema,
    currency: currencySchema,
  })
  // ISO dates compare correctly as strings.
  .refine((p) => p.checkOut > p.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type ChannelReservationReceivedPayload = z.infer<typeof channelReservationReceivedPayloadSchema>;

export const channelReservationReceivedSchema = envelopeSchema(
  EVENT_TYPES.channelReservationReceived,
  1,
  channelReservationReceivedPayloadSchema,
);

export type ChannelReservationReceived = z.infer<typeof channelReservationReceivedSchema>;
