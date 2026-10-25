import { z } from 'zod';

// Money is never a float: 0.1 + 0.2 !== 0.3. Amounts are integers in the currency's
// minor unit (cents for EUR/USD). Note the exponent differs per currency: JPY has 0
// decimals, BHD has 3, so converting to a display value needs the currency.
export const amountMinorSchema = z.int().nonnegative();

// ISO 4217 alphabetic code, e.g. EUR, USD.
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');
