import { z } from 'zod';
import { toMinorUnits } from '@kabbit/contracts';
import type { AdapterResult, ChannelAdapter } from './adapter.js';

// The (simulated) Booking.com webhook format: nested, numeric reservation id, money as a float.
const bookingWebhookSchema = z.object({
  reservation: z.object({
    id: z.number().int().positive(),
    hotel_id: z.string().min(1),
    status: z.string(),
    booker: z.object({
      full_name: z.string().min(1),
      email: z.email(),
    }),
    arrival: z.iso.date(),
    departure: z.iso.date(),
    price: z.object({
      total: z.number().nonnegative(),
      currency_code: z.string().length(3),
    }),
  }),
});

export const bookingAdapter: ChannelAdapter = {
  channel: 'booking',
  parse(body: unknown): AdapterResult {
    const { reservation } = bookingWebhookSchema.parse(body);
    if (reservation.status !== 'new') {
      return { kind: 'ignored', reason: `status ${reservation.status}` };
    }
    return {
      kind: 'booking',
      booking: {
        // Kept as a string: ids are identifiers, not numbers, and may outgrow 2^53 one day.
        externalReservationId: String(reservation.id),
        externalListingId: reservation.hotel_id,
        guest: { name: reservation.booker.full_name, email: reservation.booker.email },
        checkIn: reservation.arrival,
        checkOut: reservation.departure,
        amount: toMinorUnits(reservation.price.total, reservation.price.currency_code),
        currency: reservation.price.currency_code,
      },
    };
  },
};
