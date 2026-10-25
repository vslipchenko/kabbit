import type { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-written so the schema is reviewed like any other code. `synchronize` stays off: letting
// TypeORM alter tables from entities can silently drop columns and data.
export class CreateHousekeepingTasks1761400000000 implements MigrationInterface {
  name = 'CreateHousekeepingTasks1761400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE housekeeping_tasks (
        id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        source_message_id uuid        NOT NULL CONSTRAINT housekeeping_tasks_source_message_id_key UNIQUE,
        correlation_id    text        NOT NULL,
        property_id       text        NOT NULL,
        reservation_id    text        NOT NULL,
        kind              text        NOT NULL,
        due_date          date        NOT NULL,
        notes             text,
        status            text        NOT NULL DEFAULT 'pending',
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX housekeeping_tasks_property_due_idx ON housekeeping_tasks (property_id, due_date)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE housekeeping_tasks`);
  }
}
