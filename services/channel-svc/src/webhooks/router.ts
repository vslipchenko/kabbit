import express from 'express';
import { channelSchema, type Channel } from '@kabbit/contracts';
import { adapters } from '../channels/index.js';
import { SIGNATURE_HEADER, verifySignature } from './signature.js';

export interface WebhookRouterOptions {
  secrets: Record<Channel, string>;
}

// Status codes are part of the contract with the channel: it retries on 5xx (and timeouts) until
// it gets a 2xx, and gives up on 4xx. So 4xx means "resending this won't help", 5xx "try again".
export function webhookRouter({ secrets }: WebhookRouterOptions): express.Router {
  const router = express.Router();

  // Raw bytes, not express.json(): the signature is computed over the body exactly as sent.
  router.post('/webhooks/:channel', express.raw({ type: 'application/json', limit: '100kb' }), (req, res) => {
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
    res.status(202).json({ status: 'accepted', booking: result.booking });
  });

  return router;
}
