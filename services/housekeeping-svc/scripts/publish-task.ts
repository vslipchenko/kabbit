// Dev-only publisher standing in for ops-dispatcher (Phase 1) so housekeeping-svc has work.
// Usage: pnpm --filter @kabbit/housekeeping-svc publish-task [--count 10] [--kind valid|duplicate|invalid|malformed|v2]
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { connect } from 'amqplib';
import { createEnvelope, EXCHANGES, ROUTING_KEYS, scheduleHousekeepingTaskV1, SERVICES } from '@kabbit/contracts';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    kind: { type: 'string', default: 'valid' },
    url: { type: 'string', default: process.env.RABBITMQ_URL ?? 'amqp://kabbit:kabbit@localhost:5672' },
  },
});

const build = (i: number): Buffer => {
  const task = createEnvelope(
    scheduleHousekeepingTaskV1,
    { propertyId: `prop-${(i % 3) + 1}`, reservationId: `res-${randomUUID().slice(0, 8)}`, kind: 'cleaning', dueDate: '2026-11-04' },
    { correlationId: randomUUID(), producer: SERVICES.opsDispatcher },
  );
  switch (values.kind) {
    case 'valid':
    case 'duplicate': // published twice below, like a redelivery
      return Buffer.from(JSON.stringify(task));
    case 'invalid': // poison: a valid envelope with a payload no retry will ever fix
      return Buffer.from(JSON.stringify({ ...task, payload: { ...task.payload, dueDate: 'next tuesday' } }));
    case 'malformed': // not even JSON
      return Buffer.from('this is not json');
    case 'v2': // a newer producer this consumer doesn't understand yet
      return Buffer.from(JSON.stringify({ ...task, version: 2 }));
    default:
      throw new Error(`Unknown --kind ${values.kind}`);
  }
};

const connection = await connect(values.url);
// A confirm channel: the broker acknowledges each publish, so "sent" means "stored by RabbitMQ".
const channel = await connection.createConfirmChannel();
for (let i = 0; i < Number(values.count); i++) {
  const content = build(i);
  for (let copy = 0; copy < (values.kind === 'duplicate' ? 2 : 1); copy++) {
    channel.publish(EXCHANGES.ops, ROUTING_KEYS.housekeepingTaskCleaning, content, {
      persistent: true,
      contentType: 'application/json',
    });
  }
}
await channel.waitForConfirms();
console.log(`Published ${values.count} ${values.kind} task(s) to ${EXCHANGES.ops}`);
await connection.close();
