import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import pino from 'pino';
import { validateEnv } from '@config/env.schema';
import { JobsService } from '@jobs/jobs.service';
import { AppModule } from './app.module';

async function bootstrapWorker(): Promise<void> {
  const env = validateEnv(process.env);
  const logger = pino({
    level: 'info',
    base: {
      service: 'albo-job-worker',
      environment: env.NODE_ENV,
    },
  });

  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const jobsService = appContext.get(JobsService);
  await jobsService.startWorkers();

  logger.info(
    {
      event: 'worker_started',
      queues: [
        'environment-ingestion',
        'risk-assessment',
        'report-generation',
        'notification-delivery',
      ],
    },
    'albo_job_worker_ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'albo_job_worker_stopping');
    try {
      await jobsService.stopAll();
      await appContext.close();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrapWorker();
