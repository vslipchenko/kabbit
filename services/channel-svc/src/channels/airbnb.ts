import { z } from 'zod';
import { toMinorUnits } from '@kabbit/contracts';
import type { AdapterResult, ChannelAdapter } from './adapter.js';

// The (simulated) Airbnb webhook format: flat, split guest name, money as a decimal string.
const airbnbWebhookSchema = z.object({
  event_type: z.string(),
  confirmation_code: z.string().min(1),
  listing_id: z.string().min(1),
  guest: z.object({
    first_name: z.string().min(1),
    last_name: z.string(),
    email: z.email(),
  }),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  payout: z.object({
    amount: z.string(),
    currency: z.string().length(3),
  }),
});

export const airbnbAdapter: ChannelAdapter = {
  channel: 'airbnb',
  parse(body: unknown): AdapterResult {
    const webhook = airbnbWebhookSchema.parse(body);
    // Cancellations and changes arrive on the same endpoint; they are handled in a later phase.
    if (webhook.event_type !== 'reservation_confirmed') {
      return { kind: 'ignored', reason: `event_type ${webhook.event_type}` };
    }
    return {
      kind: 'booking',
      booking: {
        externalReservationId: webhook.confirmation_code,
        externalListingId: webhook.listing_id,
        guest: { name: `${webhook.guest.first_name} ${webhook.guest.last_name}`.trim(), email: webhook.guest.email },
        checkIn: webhook.start_date,
        checkOut: webhook.end_date,
        amount: toMinorUnits(webhook.payout.amount, webhook.payout.currency),
        currency: webhook.payout.currency,
      },
    };
  },
};
