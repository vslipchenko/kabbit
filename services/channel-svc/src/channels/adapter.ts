import type { Channel } from '@kabbit/contracts';

// A booking in our own words, whatever channel it came from. Still in channel ids: mapping the
// listing to our propertyId needs the database.
export interface ChannelBooking {
  externalReservationId: string;
  externalListingId: string;
  guest: { name: string; email: string };
  checkIn: string;
  checkOut: string;
  // Minor units (cents), converted from the channel's own money format.
  amount: number;
  currency: string;
}

export type AdapterResult = { kind: 'booking'; booking: ChannelBooking } | { kind: 'ignored'; reason: string };

// Adapter pattern: one implementation per channel turns its payload into ChannelBooking, so the
// rest of the service never sees a channel-specific format. A new channel is a new adapter.
// `parse` throws when the payload doesn't match the channel's documented format.
export interface ChannelAdapter {
  readonly channel: Channel;
  parse(body: unknown): AdapterResult;
}
