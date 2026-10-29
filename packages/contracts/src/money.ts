import { z } from 'zod';

// Money is never a float: 0.1 + 0.2 !== 0.3. Amounts are integers in the currency's
// minor unit (cents for EUR/USD). Note the exponent differs per currency: JPY has 0
// decimals, BHD has 3, so converting to a display value needs the currency.
export const amountMinorSchema = z.int().nonnegative();

// ISO 4217 alphabetic code, e.g. EUR, USD.
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

// Decimal places of a currency's minor unit (EUR 2, JPY 0, BHD 3), from the ICU data built into
// JavaScript. Malformed codes throw a RangeError; well-formed but unknown ones get 2.
export const currencyExponent = (currency: string): number =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

// Converts an external amount to minor units: ('375.5', 'EUR') -> 37550, ('1500', 'JPY') -> 1500.
// Works on the decimal string, never by multiplying a float: 0.29 * 100 === 28.999999999999996.
// A float input (some APIs send `375.5`) is already approximate; toFixed picks the nearest value.
export function toMinorUnits(amount: string | number, currency: string): number {
  const exponent = currencyExponent(currency);
  const text = typeof amount === 'number' ? amount.toFixed(exponent) : amount.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Not a non-negative decimal amount: ${amount}`);
  const [, whole, fraction = ''] = match;
  if (/[1-9]/.test(fraction.slice(exponent))) {
    throw new Error(`${amount} has more decimal places than ${currency} allows (${exponent})`);
  }
  return Number(whole + fraction.slice(0, exponent).padEnd(exponent, '0'));
}
