import { connect } from 'amqplib';
import { EXCHANGES, ROUTING_PATTERNS } from '@kabbit/contracts';

// The consumer owns its queues: their names, bindings and retry behaviour are this service's
// business, so they live here rather than in contracts. Only the `ops` exchange is shared.
export const TOPOLOGY = {
  queue: 'housekeeping.tasks',
  retryQueue: 'housekeeping.tasks.retry',
  deadLetterQueue: 'housekeeping.tasks.dlq',
  retryDelayMs: 5_000,
  maxAttempts: 5,
} as const;

// Quorum queues are replicated and the recommended durable queue type since RabbitMQ 4.
const quorum = { 'x-queue-type': 'quorum' };

//   ops (topic) --housekeeping.task.*--> housekeeping.tasks
//       nack (requeue=false) -------->  housekeeping.tasks.retry   (waits retryDelayMs)
//       TTL expires ----------------->  housekeeping.tasks          (attempt + 1)
//       poison or out of attempts --->  housekeeping.tasks.dlq      (parked for a human)
//
// Retries go through the default exchange ('') straight back to our own queue, not through
// `ops`: re-publishing to `ops` would hand a duplicate to every other queue bound there.
//
// Asserting is idempotent, but only with identical arguments: changing one on an existing
// queue fails with PRECONDITION_FAILED, and the queue must be deleted first.
export async function declareTopology(url: string): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGES.ops, 'topic', { durable: true });

    await channel.assertQueue(TOPOLOGY.queue, {
      durable: true,
      arguments: {
        ...quorum,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': TOPOLOGY.retryQueue,
      },
    });
    await channel.bindQueue(TOPOLOGY.queue, EXCHANGES.ops, ROUTING_PATTERNS.housekeepingTasks);

    // Nobody consumes the retry queue: messages sit there until their TTL expires.
    await channel.assertQueue(TOPOLOGY.retryQueue, {
      durable: true,
      arguments: {
        ...quorum,
        'x-message-ttl': TOPOLOGY.retryDelayMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': TOPOLOGY.queue,
      },
    });

    await channel.assertQueue(TOPOLOGY.deadLetterQueue, { durable: true, arguments: quorum });
  } finally {
    await connection.close();
  }
}
