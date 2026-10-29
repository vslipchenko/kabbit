import { randomInt } from 'node:crypto';

// The simulator plays two external companies, so it speaks their formats, not kabbit's.
export type ChannelName = 'airbnb' | 'booking';
export const CHANNELS: readonly ChannelName[] = ['airbnb', 'booking'];

// The listings each channel has for kabbit's six demo properties (channel-svc maps them back).
const LISTINGS: Record<ChannelName, readonly string[]> = {
  airbnb: ['airbnb-1001', 'airbnb-1002', 'airbnb-1003', 'airbnb-1004', 'airbnb-1005', 'airbnb-1006'],
  booking: ['bk-501', 'bk-502', 'bk-503', 'bk-504', 'bk-505', 'bk-506'],
};

const GUESTS = [
  ['Ana', 'Kovač'],
  ['Jan', 'Novák'],
  ['Maria', 'Rossi'],
  ['Lukas', 'Schmidt'],
  ['Sofia', 'García'],
  ['Olena', 'Shevchenko'],
] as const;

const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)]!;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

let sequence = 0;

export interface Webhook {
  channel: ChannelName;
  reservationId: string;
  body: unknown;
}

// A random new booking, in the channel's own webhook format.
export function randomBooking(channel: ChannelName, listingId = pick(LISTINGS[channel])): Webhook {
  const [first, last] = pick(GUESTS);
  const email = `${first.toLowerCase()}.${randomInt(1000)}@example.com`;
  const checkIn = addDays(new Date(), randomInt(1, 60));
  const nights = randomInt(1, 8);
  const checkOut = addDays(checkIn, nights);
  const nightlyCents = randomInt(8_000, 25_000);
  const totalCents = nightlyCents * nights;
  sequence += 1;

  if (channel === 'airbnb') {
    const reservationId = `HM${Date.now().toString(36).toUpperCase()}${sequence}`;
    return {
      channel,
      reservationId,
      body: {
        event_type: 'reservation_confirmed',
        confirmation_code: reservationId,
        listing_id: listingId,
        guest: { first_name: first, last_name: last, email },
        start_date: isoDate(checkIn),
        end_date: isoDate(checkOut),
        payout: { amount: (totalCents / 100).toFixed(2), currency: 'EUR' },
      },
    };
  }

  const id = Number(`${Date.now() % 1_000_000_000}${sequence % 10}`);
  return {
    channel,
    reservationId: String(id),
    body: {
      reservation: {
        id,
        hotel_id: listingId,
        status: 'new',
        booker: { full_name: `${first} ${last}`, email },
        arrival: isoDate(checkIn),
        departure: isoDate(checkOut),
        // A float, as some real channel APIs do: channel-svc has to convert it safely.
        price: { total: totalCents / 100, currency_code: 'EUR' },
      },
    },
  };
}
