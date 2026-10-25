import { z } from 'zod';
import type { ServiceName } from './names';

// Every message on Kafka and RabbitMQ is wrapped in this envelope. The body is the source of
// truth; ids may be mirrored into Kafka headers / AMQP properties for tooling, but never only there.
const metadataShape = {
  // Unique per message; consumers store it to drop duplicates (both brokers deliver at least once).
  // Generated once, when the business action happens (in Phase 4: when the outbox row is written),
  // never at publish time: a retried publish must carry the same id, or deduplication silently breaks.
  messageId: z.uuid(),
  // What happened (events, past tense: `reservation.confirmed`) or what to do (commands,
  // imperative: `guest-message.send`); lets a consumer route or ignore a message.
  type: z.string().min(1),
  // Schema version of the payload. Additive changes (new optional fields) keep the version:
  // consumers ignore fields they don't know. Breaking changes (rename, remove, retype, change of
  // meaning) bump it, and the producer publishes both versions until every consumer has migrated.
  version: z.int().positive(),
  // When it happened in the business, not when it was sent or received. For analytics and
  // debugging only: ordering comes from Kafka partition offsets, never from clocks.
  occurredAt: z.iso.datetime({ offset: true }),
  // Shared by every message caused by one original request; ties logs together across services.
  correlationId: z.string().min(1),
  // messageId of the message that directly caused this one; absent for messages started by a
  // request or webhook. Lets you rebuild the chain of a saga step by step.
  causationId: z.uuid().optional(),
  // Service that created the message; the first question when one shows up in a dead-letter queue.
  producer: z.string().min(1),
};

// Envelope with an unvalidated payload: parsed first, to learn type and version before the
// payload schema is known (see decode.ts).
export const baseEnvelopeSchema = z.object({ ...metadataShape, payload: z.unknown() });

export type BaseEnvelope = z.infer<typeof baseEnvelopeSchema>;

export const envelopeSchema = <T extends string, V extends number, P extends z.ZodType>(
  type: T,
  version: V,
  payload: P,
) =>
  z.object({
    ...metadataShape,
    type: z.literal(type),
    version: z.literal(version),
    // The event-specific data, validated by its own schema.
    payload,
  });

// One version of one message type. A new version is a new definition, not an edit of the old one.
export const defineEvent = <T extends string, V extends number, P extends z.ZodType>(
  type: T,
  version: V,
  payloadSchema: P,
) => ({ type, version, payloadSchema, schema: envelopeSchema(type, version, payloadSchema) });

export interface AnyEventDefinition {
  readonly type: string;
  readonly version: number;
  readonly payloadSchema: z.ZodType;
  readonly schema: z.ZodType;
}

export type EventOf<D extends AnyEventDefinition> = z.output<D['schema']>;

export interface EnvelopeContext {
  correlationId: string;
  causationId?: string;
  producer: ServiceName;
  // Defaults to now; pass the business time when it is known (e.g. when the guest booked).
  occurredAt?: string;
}

// The only way services should build messages: fills in messageId and occurredAt and validates the
// result, so a producer can't publish what its consumers would reject.
export const createEnvelope = <D extends AnyEventDefinition>(
  definition: D,
  payload: z.input<D['payloadSchema']>,
  context: EnvelopeContext,
): EventOf<D> =>
  definition.schema.parse({
    messageId: crypto.randomUUID(),
    type: definition.type,
    version: definition.version,
    occurredAt: context.occurredAt ?? new Date().toISOString(),
    correlationId: context.correlationId,
    causationId: context.causationId,
    producer: context.producer,
    payload,
  }) as EventOf<D>;

// Context for a message produced in reaction to another one: same correlation, caused by it.
export const causedBy = (cause: BaseEnvelope, producer: ServiceName): EnvelopeContext => ({
  correlationId: cause.correlationId,
  causationId: cause.messageId,
  producer,
});
