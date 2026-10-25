import type { RmqContext } from '@nestjs/microservices';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { TOPOLOGY } from './topology.js';

// Nest only logs an error thrown by an RMQ event handler: the message is never acked or nacked,
// and once `prefetchCount` messages are stuck the consumer silently stops receiving. So every
// handler must end in exactly one of these.

const unwrap = (context: RmqContext) => ({
  // amqp-connection-manager opens confirm channels by default.
  channel: context.getChannelRef() as ConfirmChannel,
  message: context.getMessage() as ConsumeMessage,
});

// Done: RabbitMQ deletes the message.
export function ack(context: RmqContext): void {
  const { channel, message } = unwrap(context);
  channel.ack(message);
}

// Park the message for a human: copy it to the dead-letter queue, then ack the original. Only
// acked once the broker confirms the copy, so a crash in between duplicates rather than loses it.
export async function deadLetter(context: RmqContext, reason: string): Promise<void> {
  const { channel, message } = unwrap(context);
  await new Promise<void>((resolve, reject) =>
    channel.sendToQueue(
      TOPOLOGY.deadLetterQueue,
      message.content,
      {
        persistent: true,
        contentType: message.properties.contentType,
        headers: {
          ...message.properties.headers,
          'x-dead-letter-reason': reason,
          'x-original-routing-key': message.fields.routingKey,
        },
      },
      (err) => (err ? reject(err) : resolve()),
    ),
  );
  channel.ack(message);
}
