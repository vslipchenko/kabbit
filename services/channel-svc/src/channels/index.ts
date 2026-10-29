import type { Channel } from '@kabbit/contracts';
import type { ChannelAdapter } from './adapter.js';
import { airbnbAdapter } from './airbnb.js';
import { bookingAdapter } from './booking.js';

// Typed as a full Record: adding a channel to the contracts enum fails to compile until it has an adapter.
export const adapters: Record<Channel, ChannelAdapter> = {
  airbnb: airbnbAdapter,
  booking: bookingAdapter,
};

export type { ChannelAdapter, ChannelBooking } from './adapter.js';
