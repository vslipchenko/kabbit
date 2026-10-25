import type { ConsumerDeserializer, IncomingEvent } from '@nestjs/microservices';
import { createDecoder, scheduleHousekeepingTaskV1 } from '@kabbit/contracts';

// Every message types this service handles; anything else is undecodable here.
const decode = createDecoder([scheduleHousekeepingTaskV1]);

// Pattern for messages that failed to decode, so they still reach a handler. A message with no
// matching handler is nacked by Nest without requeue, which our queue dead-letters into the
// retry queue: it would bounce between the two forever.
export const UNDECODABLE = 'kabbit.undecodable';

// Nest's RMQ transport expects its own `{ pattern, data }` body and routes on `pattern`. Our
// publishers send the kabbit envelope instead, so this maps envelope `type` to the pattern.
// Returning no `id` makes Nest treat every message as an event (no reply expected).
export class EnvelopeDeserializer implements ConsumerDeserializer {
  deserialize(value: unknown): IncomingEvent {
    // Nest has already tried JSON.parse; on failure it passes the raw text.
    const result = decode(typeof value === 'string' ? value : JSON.stringify(value));
    return result.ok ? { pattern: result.event.type, data: result.event } : { pattern: UNDECODABLE, data: result };
  }
}
