import { KafkaJS } from '@confluentinc/kafka-javascript';
import type { BaseEnvelope } from '@kabbit/contracts';

export type Headers = KafkaJS.IHeaders;

// Envelope metadata copied into Kafka headers, so tools (Kafka UI, dead-letter inspection) can see
// it without parsing the body. The body stays the source of truth.
const envelopeHeaders = (envelope: BaseEnvelope): Headers => ({
  'message-id': envelope.messageId,
  type: envelope.type,
  'correlation-id': envelope.correlationId,
  producer: envelope.producer,
});

export class EnvelopeProducer {
  private readonly producer: KafkaJS.Producer;

  constructor(kafka: KafkaJS.Kafka) {
    this.producer = kafka.producer({
      kafkaJS: {
        // Wait until every in-sync replica has the message before `publish` resolves.
        acks: -1,
        // The broker drops duplicates caused by the producer's own retries, and keeps order per
        // partition even with several requests in flight.
        idempotent: true,
        allowAutoTopicCreation: false,
      },
    });
  }

  connect(): Promise<void> {
    return this.producer.connect();
  }

  // Flushes anything still buffered before closing.
  disconnect(): Promise<void> {
    return this.producer.disconnect();
  }

  // Resolves once the broker has stored the message; its offset is in `baseOffset` (not `offset`).
  // The key picks the partition: every message with the same key lands on the same partition, in
  // the order it was published.
  async publish(topic: string, key: string, envelope: BaseEnvelope): Promise<KafkaJS.RecordMetadata> {
    return this.send(topic, key, Buffer.from(JSON.stringify(envelope)), envelopeHeaders(envelope));
  }

  // For bytes that aren't (valid) envelopes, e.g. forwarding a broken message to a dead-letter topic.
  async publishRaw(topic: string, key: string | Buffer | null, value: Buffer | null, headers: Headers): Promise<KafkaJS.RecordMetadata> {
    return this.send(topic, key, value, headers);
  }

  private async send(topic: string, key: string | Buffer | null, value: Buffer | null, headers: Headers) {
    const [metadata] = await this.producer.send({ topic, messages: [{ key, value, headers }] });
    return metadata;
  }
}
