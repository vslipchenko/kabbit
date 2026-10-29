// Rebuilds analytics from scratch by replaying channel.reservations from the oldest retained message.
// Stop every analytics-svc instance first, run this, then start them again.
//   pnpm --filter @kabbit/analytics-svc replay
import pg from 'pg';
import { createKafka, describeError } from '@kabbit/kafka';
import { validateEnv } from '../src/config.js';

const env = validateEnv(process.env);
const kafka = createKafka({ brokers: env.KAFKA_BROKERS, clientId: 'analytics-replay' });
const admin = kafka.admin();
await admin.connect();

try {
  // Offsets can only be dropped while nobody is consuming: a live member would just commit again.
  const {
    groups: [group],
  } = await admin.describeGroups([env.KAFKA_GROUP_ID]);
  if (group && group.members.length > 0) {
    console.error(`Group ${env.KAFKA_GROUP_ID} still has ${group.members.length} active member(s). Stop analytics-svc first.`);
    process.exitCode = 1;
  } else {
    // 1. Forget the group's committed offsets. With none, the consumer's `fromBeginning` makes
    //    the next start read the topic from the oldest retained message.
    const [result] = await admin.deleteGroups([env.KAFKA_GROUP_ID]);
    if (result?.error) console.log(`No offsets to delete (${describeError(result.error)})`);
    else console.log(`Deleted consumer group ${env.KAFKA_GROUP_ID}`);

    // 2. Then empty the read model. This order fails safe: if this step fails, the replay runs
    //    into existing rows and processed_messages skips what's already counted. The opposite
    //    order could leave empty tables with offsets at the end of the topic: nothing to rebuild.
    const db = new pg.Client({ connectionString: env.DATABASE_URL });
    await db.connect();
    await db.query('TRUNCATE booking_stats, processed_messages');
    await db.end();
    console.log('Cleared booking_stats and processed_messages. Start analytics-svc to replay.');
  }
} finally {
  await admin.disconnect();
}
