import { z } from 'zod';
import { baseEnvelopeSchema, type AnyEventDefinition, type BaseEnvelope, type EventOf } from './envelope';

// Why a message could not be decoded, and what a consumer should do about it:
// - malformed:           not JSON, or not an envelope              → dead-letter
// - invalid:             known type and version, payload is wrong  → dead-letter (retrying never helps)
// - unsupported-version: known type, version this consumer lacks   → dead-letter and alert (likely a newer producer)
// - unhandled-type:      type this consumer doesn't care about     → skip and ack; topics carry several types
export type DecodeFailure =
  | { ok: false; reason: 'malformed'; error: string }
  | {
      ok: false;
      reason: 'invalid' | 'unsupported-version' | 'unhandled-type';
      error: string;
      envelope: BaseEnvelope;
    };

export type DecodeResult<E> = { ok: true; event: E } | DecodeFailure;

const keyOf = (type: string, version: number) => `${type}@${version}`;

// Builds a decoder for the messages one consumer handles. The result is a union discriminated by
// `type` (and `version`), so the consumer can switch on it with full type safety.
export const createDecoder = <const D extends readonly AnyEventDefinition[]>(definitions: D) => {
  const registry = new Map<string, AnyEventDefinition>();
  const knownTypes = new Set<string>();
  for (const definition of definitions) {
    const key = keyOf(definition.type, definition.version);
    if (registry.has(key)) throw new Error(`Duplicate event definition: ${key}`);
    registry.set(key, definition);
    knownTypes.add(definition.type);
  }

  return (raw: string | Uint8Array): DecodeResult<EventOf<D[number]>> => {
    let json: unknown;
    try {
      json = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch (err) {
      return { ok: false, reason: 'malformed', error: `Not JSON: ${(err as Error).message}` };
    }

    const base = baseEnvelopeSchema.safeParse(json);
    if (!base.success) return { ok: false, reason: 'malformed', error: z.prettifyError(base.error) };
    const envelope = base.data;

    const definition = registry.get(keyOf(envelope.type, envelope.version));
    if (!definition) {
      return knownTypes.has(envelope.type)
        ? { ok: false, reason: 'unsupported-version', error: `No handler for ${keyOf(envelope.type, envelope.version)}`, envelope }
        : { ok: false, reason: 'unhandled-type', error: `Not handled here: ${envelope.type}`, envelope };
    }

    const event = definition.schema.safeParse(json);
    if (!event.success) return { ok: false, reason: 'invalid', error: z.prettifyError(event.error), envelope };
    return { ok: true, event: event.data as EventOf<D[number]> };
  };
};
