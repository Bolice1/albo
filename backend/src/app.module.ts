import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import type { DestinationStream } from 'pino';
import { AppConfigModule } from '@config/app-config.module';
import { RequestContextModule } from '@common/context/request-context.service';
import { GlobalExceptionFilter } from '@common/errors/global-exception.filter';
import { createRedactedValidationPipe } from '@common/errors/validation.pipe';
import { EnvelopeInterceptor } from '@common/http/envelope.interceptor';
import { IdempotencyInterceptor } from '@common/http/idempotency.interceptor';
import { LoggingModule } from '@common/logging/logging.module';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { DatabaseModule } from '@database/database.module';
import { AiServiceModule } from '@integrations/ai-service/ai-service.module';
import { AuditModule } from '@modules/audit/audit.module';
import { AssistantModule } from '@modules/assistant/assistant.module';
import { ConsentModule } from '@modules/consent/consent.module';
import { EnvironmentModule } from '@modules/environment/environment.module';
import { FacilitiesCareModule } from '@modules/facilities-care/facilities-care.module';
import { HealthProfileModule } from '@modules/health-profile/health-profile.module';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';
import { NotificationsReportsModule } from '@modules/notifications-reports/notifications-reports.module';
import { RiskAssessmentModule } from '@modules/risk-assessment/risk-assessment.module';
import { JobsModule } from '@jobs/jobs.module';
import { HealthModule } from './health/health.module';

const CORE_DOMAIN_MODULES = [
  AppConfigModule,
  RequestContextModule,
  DatabaseModule,
  AiServiceModule,
  AuditModule,
  ConsentModule,
  IdentityAccessModule,
  HealthModule,
  HealthProfileModule,
  EnvironmentModule,
  RiskAssessmentModule,
  FacilitiesCareModule,
  NotificationsReportsModule,
  AssistantModule,
  JobsModule,
];

const GLOBAL_HTTP_PROVIDERS = [
  {
    provide: APP_FILTER,
    useClass: GlobalExceptionFilter,
  },
  {
    provide: APP_PIPE,
    useFactory: () => createRedactedValidationPipe(),
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: IdempotencyInterceptor,
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: EnvelopeInterceptor,
  },
];

@Module({
  imports: [LoggingModule.register(), ...CORE_DOMAIN_MODULES],
  providers: [...GLOBAL_HTTP_PROVIDERS],
})
export class AppModule implements NestModule {
  static register(destinationStream?: DestinationStream): DynamicModule {
    return {
      module: AppModule,
      imports: [LoggingModule.register(destinationStream), ...CORE_DOMAIN_MODULES],
      providers: [...GLOBAL_HTTP_PROVIDERS],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
