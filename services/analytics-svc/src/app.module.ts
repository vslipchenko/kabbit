import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv, type Env } from './config.js';
import { HealthController } from './health.controller.js';
import { CreateBookingStats1761700000000 } from './migrations/1761700000000-create-booking-stats.js';
import { StatsModule } from './stats/stats.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        migrations: [CreateBookingStats1761700000000],
        // TypeORM takes no lock while migrating, so replicas started together can race: a loser
        // fails on the existing tables and is restarted (compose `restart: on-failure`), finding
        // the migration applied. In production, run migrations as a separate deploy step instead.
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    StatsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
