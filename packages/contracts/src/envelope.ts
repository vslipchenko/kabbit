import { z } from 'zod';

// Every message on Kafka and RabbitMQ is wrapped in this envelope.
export const envelopeSchema = <T extends string, V extends number, P extends z.ZodType>(
  type: T,
  version: V,
  payload: P,
) =>
  z.object({
    // Unique per message; consumers store it to drop duplicates (both brokers deliver at least once).
    messageId: z.uuid(),
    // What happened; lets a consumer route or ignore a message without parsing the payload.
    type: z.literal(type),
    // Schema version of the payload; lets old and new producers/consumers coexist during a change.
    version: z.literal(version),
    // When it happened in the business, not when it was sent or received; ordering and replays rely on it.
    occurredAt: z.iso.datetime({ offset: true }),
    // Shared by every message caused by one original request; ties logs and traces together across services.
    correlationId: z.string().min(1),
    // The event-specific data, validated by its own schema.
    payload,
  });
