import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-kabbit-signature';

// The channel signs the exact bytes it sends: `sha256=<hex HMAC of the body>`. Verification must
// use the raw body too: parsing and re-serializing JSON can change whitespace or key order, and
// with it the signature.
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  // Constant-time comparison: `===` stops at the first differing byte, and the response time
  // would leak how much of a forged signature was right.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
