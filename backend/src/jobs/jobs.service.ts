import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { AppConfigService } from '@config/app-config.service';
import { EnvironmentService } from '@modules/environment/environment.service';
import { NotificationsReportsService } from '@modules/notifications-reports/notifications-reports.service';
import { RiskAssessmentService } from '@modules/risk-assessment/risk-assessment.service';
import {
  ALBO_QUEUE_NAMES,
  AlboQueueName,
  EnvironmentIngestionJobPayload,
  NotificationDeliveryJobPayload,
  ReportGenerationJobPayload,
  RiskAssessmentJobPayload,
} from './queues.constants';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly queues = new Map<AlboQueueName, Queue>();
  private readonly workers: Worker[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly environmentService: EnvironmentService,
    private readonly riskAssessmentService: RiskAssessmentService,
    private readonly notificationsReportsService: NotificationsReportsService,
  ) {}

  async enqueueReportGeneration(payload: ReportGenerationJobPayload): Promise<string> {
    const queue = this.getOrCreateQueue(ALBO_QUEUE_NAMES.REPORT_GENERATION);
    const job = await queue.add('generate-report', payload, {
      jobId: `report-${payload.report_id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id ?? `report-${payload.report_id}`;
  }

  async enqueueRiskAssessment(payload: RiskAssessmentJobPayload): Promise<string> {
    const queue = this.getOrCreateQueue(ALBO_QUEUE_NAMES.RISK_ASSESSMENT);
    const job = await queue.add('calculate-risk', payload, {
      jobId: `risk-${payload.assessment_id}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 500 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id ?? `risk-${payload.assessment_id}`;
  }

  async enqueueNotificationDelivery(payload: NotificationDeliveryJobPayload): Promise<string> {
    const queue = this.getOrCreateQueue(ALBO_QUEUE_NAMES.NOTIFICATION_DELIVERY);
    const job = await queue.add('deliver-notification', payload, {
      jobId: `notif-${payload.notification_id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id ?? `notif-${payload.notification_id}`;
  }

  async enqueueEnvironmentIngestion(payload: EnvironmentIngestionJobPayload): Promise<string> {
    const queue = this.getOrCreateQueue(ALBO_QUEUE_NAMES.ENVIRONMENT_INGESTION);
    const job = await queue.add('ingest-environment', payload, {
      jobId: payload.idempotency_key,
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id ?? payload.idempotency_key;
  }

  async processReportJob(payload: ReportGenerationJobPayload): Promise<void> {
    await this.notificationsReportsService.generateReportById(payload.report_id);
  }

  async processRiskAssessmentJob(payload: RiskAssessmentJobPayload): Promise<void> {
    await this.riskAssessmentService.executeQueuedRiskAssessment(payload.assessment_id);
  }

  async processNotificationJob(payload: NotificationDeliveryJobPayload): Promise<void> {
    await this.notificationsReportsService.deliverPendingExternalNotification(
      payload.notification_id,
    );
  }

  async processEnvironmentIngestionJob(payload: EnvironmentIngestionJobPayload): Promise<void> {
    await this.environmentService.ingestAreaObservations(payload.area_code, {
      idempotencyKey: payload.idempotency_key,
    });
  }

  /**
   * Starts BullMQ Redis workers for all 4 bounded domain queues (`job-worker` runtime).
   * Payloads carry opaque IDs only (zero PHI or credentials in Redis — T-020), and every
   * personal-data processor re-checks active consent at execution time (T-044).
   */
  async startWorkers(): Promise<void> {
    if (this.workers.length > 0) {
      return;
    }

    const connection = this.buildBullConnectionOptions();

    const reportWorker = new Worker<ReportGenerationJobPayload>(
      ALBO_QUEUE_NAMES.REPORT_GENERATION,
      async (job: Job<ReportGenerationJobPayload>) => {
        await this.processReportJob(job.data);
      },
      { connection, concurrency: 2 },
    );

    const riskWorker = new Worker<RiskAssessmentJobPayload>(
      ALBO_QUEUE_NAMES.RISK_ASSESSMENT,
      async (job: Job<RiskAssessmentJobPayload>) => {
        await this.processRiskAssessmentJob(job.data);
      },
      { connection, concurrency: 4 },
    );

    const notifWorker = new Worker<NotificationDeliveryJobPayload>(
      ALBO_QUEUE_NAMES.NOTIFICATION_DELIVERY,
      async (job: Job<NotificationDeliveryJobPayload>) => {
        await this.processNotificationJob(job.data);
      },
      { connection, concurrency: 4 },
    );

    const envWorker = new Worker<EnvironmentIngestionJobPayload>(
      ALBO_QUEUE_NAMES.ENVIRONMENT_INGESTION,
      async (job: Job<EnvironmentIngestionJobPayload>) => {
        await this.processEnvironmentIngestionJob(job.data);
      },
      { connection, concurrency: 2 },
    );

    this.workers.push(reportWorker, riskWorker, notifWorker, envWorker);
    await Promise.all(this.workers.map((w) => w.waitUntilReady()));
  }

  async stopAll(): Promise<void> {
    const activeWorkers = this.workers.splice(0, this.workers.length);
    await Promise.allSettled(activeWorkers.map((w) => w.close()));

    const activeQueues = Array.from(this.queues.values());
    this.queues.clear();
    await Promise.allSettled(activeQueues.map((q) => q.close()));
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopAll();
  }

  private getOrCreateQueue(name: AlboQueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }
    const created = new Queue(name, {
      connection: this.buildBullConnectionOptions(),
    });
    this.queues.set(name, created);
    return created;
  }

  private buildBullConnectionOptions(): {
    host: string;
    port: number;
    db: number;
    password?: string;
    username?: string;
    maxRetriesPerRequest: null;
  } {
    const parsed = new URL(this.config.redisUrl);
    const dbPath = parsed.pathname.replace(/^\//, '');
    const db = dbPath ? Number(dbPath) || 0 : 0;

    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 6379,
      db,
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      maxRetriesPerRequest: null,
    };
  }
}
