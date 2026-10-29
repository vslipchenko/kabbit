import { randomUUID } from 'node:crypto';
import express from 'express';
import { channelSchema, type Channel } from '@kabbit/contracts';
import { describeError } from '@kabbit/kafka';
import { UnknownListingError, type BookingIngestor } from '../bookings/ingest.js';
import { adapters } from '../channels/index.js';
import { SIGNATURE_HEADER, verifySignature } from './signature.js';

export interface WebhookRouterOptions {
  secrets: Record<Channel, string>;
  ingestor: BookingIngestor;
}

// Status codes are part of the contract with the channel: it retries on 5xx (and timeouts) until
// it gets a 2xx, and gives up on 4xx. So 4xx means "resending this won't help", 5xx "try again".
export function webhookRouter({ secrets, ingestor }: WebhookRouterOptions): express.Router {
  const router = express.Router();

  // Raw bytes, not express.json(): the signature is computed over the body exactly as sent.
  router.post('/webhooks/:channel', express.raw({ type: 'application/json', limit: '100kb' }), async (req, res) => {
    const channel = channelSchema.safeParse(req.params.channel);
    if (!channel.success) {
      res.status(404).json({ error: `Unknown channel ${req.params.channel}` });
      return;
    }

    const rawBody: unknown = req.body;
    if (!Buffer.isBuffer(rawBody) || !verifySignature(secrets[channel.data], rawBody, req.get(SIGNATURE_HEADER))) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let result;
    try {
      result = adapters[channel.data].parse(JSON.parse(rawBody.toString('utf8')));
    } catch (err) {
      res.status(422).json({ error: `Payload doesn't match the ${channel.data} format`, detail: (err as Error).message });
      return;
    }

    if (result.kind === 'ignored') {
      res.status(200).json({ status: 'ignored', reason: result.reason });
      return;
    }

    // Starts the correlation chain: every message caused by this webhook carries the same id.
    const correlationId = req.get('x-request-id') ?? randomUUID();
    try {
      const outcome = await ingestor.ingest(channel.data, result.booking, correlationId);
      if (outcome.status === 'duplicate') {
        // 200, not an error: the channel must stop resending.
        res.status(200).json(outcome);
        return;
      }
      console.log(
        `Published ${channel.data} booking ${result.booking.externalReservationId} for ${outcome.propertyId} to partition ${outcome.partition} (message ${outcome.messageId})`,
      );
      res.status(202).json(outcome);
    } catch (err) {
      if (err instanceof UnknownListingError) {
        res.status(422).json({ error: err.message });
        return;
      }
      // Kafka or Postgres unavailable: nothing was recorded, so the channel's retry is safe.
      console.error(`Ingesting ${channel.data} booking ${result.booking.externalReservationId} failed: ${describeError(err)}`);
      res.status(503).json({ error: 'Temporarily unavailable, retry later' });
    }
  });

  return router;
}
