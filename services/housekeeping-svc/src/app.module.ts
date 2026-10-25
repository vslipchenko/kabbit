import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv, type Env } from './config.js';
import { HealthController } from './health.controller.js';
import { CreateHousekeepingTasks1761400000000 } from './migrations/1761400000000-create-housekeeping-tasks.js';
import { HousekeepingTask } from './tasks/housekeeping-task.entity.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        // Listed explicitly instead of globbed: globs over dist/ break in ESM and are easy to get wrong.
        entities: [HousekeepingTask],
        migrations: [CreateHousekeepingTasks1761400000000],
        // Applies pending migrations on startup; fine for one replica. With several, run them as
        // a separate step before deploying, so replicas don't race each other.
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
