import { createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ChannelName, Webhook } from './bookings.js';

export interface DeliveryResult {
  channel: ChannelName;
  reservationId: string;
  status: number | 'unreachable';
  attempts: number;
  response?: unknown;
}

const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 15_000;

// Delivers a webhook the way channels do: signed, and retried with backoff on 5xx, timeouts and
// network errors until it gets an answer. 2xx and 4xx are final (4xx: resending won't help).
export async function deliver(webhook: Webhook, url: string, secret: string): Promise<DeliveryResult> {
  const body = JSON.stringify(webhook.body);
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  let status: DeliveryResult['status'] = 'unreachable';
  let response: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${url}/webhooks/${webhook.channel}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kabbit-signature': signature },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      response = await res.json().catch(() => undefined);
      if (res.status < 500) return { channel: webhook.channel, reservationId: webhook.reservationId, status, attempts: attempt, response };
    } catch {
      status = 'unreachable';
    }
    if (attempt < MAX_ATTEMPTS) {
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.warn(`${webhook.channel} ${webhook.reservationId}: got ${status}, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  return { channel: webhook.channel, reservationId: webhook.reservationId, status, attempts: MAX_ATTEMPTS, response };
}
