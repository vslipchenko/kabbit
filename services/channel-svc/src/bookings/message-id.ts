import { createHash } from 'node:crypto';

// Random, fixed namespace for kabbit's channel bookings, so ids never collide with other v5 uses.
const NAMESPACE = 'd2b4c0a6-5e1f-4c39-9b8e-7a6f3e2d1c0b';

// RFC 9562 UUIDv5: a SHA-1 of namespace + name, with the version and variant bits set. The same
// name always gives the same UUID.
export function uuidV5(name: string, namespace = NAMESPACE): string {
  const hash = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// One booking on one channel always gets the same messageId, however often its webhook arrives.
export const bookingMessageId = (channel: string, externalReservationId: string): string =>
  uuidV5(`${channel}:${externalReservationId}`);
