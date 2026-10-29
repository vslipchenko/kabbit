import { setTimeout as sleep } from 'node:timers/promises';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { createDecoder, type AnyEventDefinition, type EventOf } from '@kabbit/contracts';
import { describeError, type Logger } from './client';
import type { EnvelopeProducer, Headers } from './producer';

// Where a message came from; handlers can log it, or store the offset alongside their writes.
export interface ConsumedRecord {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
}

export interface EnvelopeConsumerOptions<D extends readonly AnyEventDefinition[]> {
  kafka: KafkaJS.Kafka;
  // Consumers sharing a groupId split the partitions between them; each group gets every message.
  groupId: string;
  topics: readonly string[];
  // The message types this consumer handles. Other types on the topics are skipped.
  definitions: D;
  // Must be idempotent: delivery is at least once, and a message is redelivered after a crash or
  // a rebalance if its offset wasn't committed yet.
  handle: (event: EventOf<D[number]>, record: ConsumedRecord) => Promise<void>;
  // Publishes undecodable messages to `<topic>.dlt`.
  deadLetters: EnvelopeProducer;
  logger?: Logger;
  maxBackoffMs?: number;
}

export interface RunningConsumer {
  stop(): Promise<void>;
}

// Error handling, and why it differs from RabbitMQ:
// A partition is an ordered log. When `eachMessage` throws, the client seeks back and redelivers
// the same message, and nothing behind it on that partition is processed meanwhile. That keeps
// order (a cancellation never overtakes its booking), but one bad message would block the
// partition forever. So:
// - undecodable messages (malformed, invalid, unsupported version) can never succeed: they go to
//   the dead-letter topic and the consumer moves on;
// - handler errors are assumed transient (database down): retried with growing backoff, so a
//   failing dependency isn't hammered, while the partition waits. Lag grows, nothing is lost.
export async function startEnvelopeConsumer<const D extends readonly AnyEventDefinition[]>(
  options: EnvelopeConsumerOptions<D>,
): Promise<RunningConsumer> {
  const { kafka, groupId, topics, definitions, handle, deadLetters, logger = console, maxBackoffMs = 30_000 } = options;
  const decode = createDecoder(definitions);
  const failedAttempts = new Map<string, number>();

  const consumer = kafka.consumer({
    kafkaJS: {
      groupId,
      // Only applies when the group has no committed offset yet: a new group (or one deleted for
      // a replay) starts from the oldest retained message instead of only new ones.
      fromBeginning: true,
      // Commits, every 5s, the offsets of messages whose handler has *returned*. A crash loses
      // at most those 5s of commits, which means redelivery, never a skipped message.
      autoCommit: true,
      allowAutoTopicCreation: false,
    },
  });

  const deadLetter = async (message: KafkaJS.KafkaMessage, record: ConsumedRecord, reason: string, error: string) => {
    logger.warn(`Dead-lettering ${reason} message ${record.topic}[${record.partition}]@${record.offset}: ${error}`);
    await deadLetters.publishRaw(`${record.topic}.dlt`, message.key, message.value, {
      ...(message.headers as Headers | undefined),
      'dlt-reason': reason,
      'dlt-error': error.slice(0, 1000),
      'dlt-original-topic': record.topic,
      'dlt-original-partition': String(record.partition),
      'dlt-original-offset': record.offset,
      'dlt-consumer-group': groupId,
    });
  };

  await consumer.connect();
  await consumer.subscribe({ topics: [...topics] });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const record: ConsumedRecord = { topic, partition, offset: message.offset, key: message.key?.toString() ?? null };

      if (!message.value) return deadLetter(message, record, 'malformed', 'Empty message value');
      const result = decode(message.value);
      if (!result.ok) {
        // Topics carry several types; ones this consumer doesn't handle aren't errors.
        if (result.reason === 'unhandled-type') return;
        return deadLetter(message, record, result.reason, result.error);
      }

      const attemptKey = `${topic}:${partition}:${message.offset}`;
      try {
        await handle(result.event, record);
        failedAttempts.delete(attemptKey);
      } catch (err) {
        const attempt = (failedAttempts.get(attemptKey) ?? 0) + 1;
        failedAttempts.set(attemptKey, attempt);
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), maxBackoffMs);
        logger.error(
          `Handling ${topic}[${partition}]@${message.offset} failed (attempt ${attempt}), partition paused for ${delayMs}ms: ${describeError(err)}`,
        );
        await sleep(delayMs);
        // Rethrow: the client seeks back to this offset and delivers the message again.
        throw err;
      }
    },
  });

  // Disconnecting commits the offsets of everything handled so far, so a clean shutdown causes
  // no redelivery.
  return { stop: () => consumer.disconnect() };
}
