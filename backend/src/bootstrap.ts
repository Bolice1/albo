import { INestApplication, RequestMethod } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '@config/app-config.service';

export function configureHttpApplication(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.enableShutdownHooks();
}
