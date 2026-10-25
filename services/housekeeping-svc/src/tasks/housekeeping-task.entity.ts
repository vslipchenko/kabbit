import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Column types are spelled out: TypeORM can't infer one from `string | null`, and the
// migration, not the entity, is what actually creates the table.
@Entity({ name: 'housekeeping_tasks' })
export class HousekeepingTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // messageId of the command that created this task. Unique, so a redelivered command (both
  // brokers deliver at least once) is stored only once: an idempotent consumer.
  @Column({ name: 'source_message_id', type: 'uuid', unique: true })
  sourceMessageId!: string;

  @Column({ name: 'correlation_id', type: 'text' })
  correlationId!: string;

  @Column({ name: 'property_id', type: 'text' })
  propertyId!: string;

  @Column({ name: 'reservation_id', type: 'text' })
  reservationId!: string;

  @Column({ type: 'text' })
  kind!: string;

  // A calendar date; TypeORM returns `date` columns as 'YYYY-MM-DD' strings.
  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', default: 'pending' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
