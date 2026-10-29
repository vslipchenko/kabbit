import { KafkaJS } from '@confluentinc/kafka-javascript';

export interface KafkaClientOptions {
  // `kafka:9092` from containers, `localhost:9094` from the host: see the listeners in docker-compose.yml.
  brokers: string[];
  // Shows up in broker logs and Kafka UI, so name it after the service.
  clientId: string;
}

// The Confluent client wraps librdkafka (C). Its KafkaJS-compatible API nests the familiar options
// under `kafkaJS`; anything outside that block is a raw librdkafka setting.
export const createKafka = ({ brokers, clientId }: KafkaClientOptions): KafkaJS.Kafka =>
  new KafkaJS.Kafka({ kafkaJS: { brokers, clientId, logLevel: KafkaJS.logLevel.WARN } });

// Minimal logger, satisfied by both `console` and Nest's `Logger`.
export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Node reports a refused connection as an AggregateError with an empty message; the code says
// what actually happened.
export const describeError = (err: unknown): string => {
  const { message, code } = err as { message?: string; code?: string | number };
  return [code, message].filter(Boolean).join(': ') || String(err);
};
