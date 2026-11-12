import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/env.validation.js';
import { entities } from './database/entities/all-entities.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { UsersModule } from './users/users.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { IncidentLogsModule } from './incident-logs/incident-logs.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { IncidentTypesModule } from './incident-types/incident-types.module.js';
import { AttachmentsModule } from './attachments/attachments.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        entities,
        synchronize: config.getOrThrow<string>('DB_SYNCHRONIZE') === 'true',
        logging: false,
      }),
    }),
    AuthModule,
    UsersModule,
    IncidentsModule,
    AssignmentsModule,
    IncidentLogsModule,
    NotificationsModule,
    DashboardModule,
    GatewayModule,
    UploadsModule,
    IncidentTypesModule,
    AttachmentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
