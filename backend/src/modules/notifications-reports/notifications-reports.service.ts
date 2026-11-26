import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditOutcome,
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationStatus,
  Prisma,
  Report,
  ReportAccess,
  ReportStatus,
  RiskLevel,
} from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  ConflictDomainException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { PrismaService } from '@database/prisma.service';
import {
  assertZeroPhiNotificationPayload,
  ExternalNotificationChannel,
  NOTIFICATION_CHANNEL_ADAPTER,
  NotificationChannelAdapter,
} from '@integrations/notifications/notification-channel.adapter';
import { ObjectStorageService } from '@integrations/storage/object-storage.service';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import {
  ALLOWED_NOTIFICATION_CATEGORIES,
  ALLOWED_REPORT_CATEGORIES,
  GetTrendsQueryDto,
  GrantReportAccessDto,
  RequestReportDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications-reports.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_TEMPLATE_VERSION = 'albo-printable-report-v1.0.0';
const NOTIFICATION_TEMPLATE_VERSION = 'notif-v1.0.0';
const MAX_REPORT_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const REPORT_NON_DIAGNOSTIC_DISCLAIMER =
  'This personal summary report presents self-reported lifestyle inputs, regional environmental observations, rule-generated preventive indicators, and recorded provider follow-up notes. Rule-generated indicators are NOT medical diagnoses or prescriptions.';

export interface NotificationPreferenceView {
  user_account_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  enabled_categories: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
}

export interface NotificationView {
  id: string;
  category: string;
  channel: NotificationChannel;
  title_key: string;
  body_key: string;
  in_app_target_path: string | null;
  content_template_version: string;
  status: NotificationStatus;
  scheduled_at: string;
  sent_at: string | null;
  read_at: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface DispatchPreventiveNotificationInput {
  userAccountId: string;
  category: string;
  titleKey: string;
  bodyKey: string;
  inAppTargetPath?: string | null;
  sourceReference?: string | null;
  externalChannels?: ExternalNotificationChannel[];
  referenceTime?: Date;
  idempotencyKeyPrefix?: string;
}

export interface PersonalTrendsView {
  period_days: number;
  period_start: string;
  period_end: string;
  non_diagnostic_disclaimer: string;
  self_reported_health_inputs: Array<{
    id: string;
    field_code: string;
    category: string;
    value: number | string | null;
    unit: string | null;
    observed_at: string;
    status: string;
    source_type: string;
  }>;
  rule_generated_risk_indicators: Array<{
    id: string;
    use_case: string;
    rule_model_version: string;
    status: string;
    level: string | null;
    historical_level: string | null;
    calculated_at: string | null;
    limitations: string[];
    provenance_type: 'rule_generated';
  }>;
  provider_recorded_follow_ups: Array<{
    id: string;
    action_type: string;
    recommended_follow_up_at: string | null;
    created_at: string;
    provenance_type: 'provider_recorded';
  }>;
  regional_environmental_observations: Array<{
    id: string;
    observation_type: string;
    location_area_id: string;
    value: number;
    unit: string;
    quality_status: string;
    observed_at: string;
    source_name: string;
    provenance_type: 'imported_regional_environmental';
  }>;
}

export interface ReportAccessGrantView {
  id: string;
  report_id: string;
  granted_to_user_id: string;
  granted_by_user_id: string;
  purpose: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ReportView {
  id: string;
  user_account_id: string;
  status: ReportStatus;
  period_start: string;
  period_end: string;
  included_categories: string[];
  source_summary: Record<string, unknown>;
  template_version: string;
  content_sha256: string | null;
  failure_code: string | null;
  non_diagnostic_disclaimer: string;
  download: {
    url: string;
    expires_in_seconds: number;
    expires_at: string;
  } | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class NotificationsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly objectStorage: ObjectStorageService,
    @Inject(NOTIFICATION_CHANNEL_ADAPTER)
    private readonly notificationAdapter: NotificationChannelAdapter,
  ) {}

  async getPreferences(principal: AuthenticatedPrincipal): Promise<NotificationPreferenceView> {
    this.accessPolicy.assertCitizenSelf(principal);
    const pref = await this.ensureNotificationPreference(principal.userAccountId);
    return this.toPreferenceView(pref);
  }

  async updatePreferences(
    principal: AuthenticatedPrincipal,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceView> {
    this.accessPolicy.assertCitizenSelf(principal);

    if (dto.enabled_categories) {
      const invalid = dto.enabled_categories.filter(
        (c) => !(ALLOWED_NOTIFICATION_CATEGORIES as readonly string[]).includes(c),
      );
      if (invalid.length > 0) {
        throw new ValidationDomainException('Unknown notification category.', [
          { field: 'enabled_categories', reason: 'unapproved_notification_category' },
        ]);
      }
    }

    await this.ensureNotificationPreference(principal.userAccountId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.notificationPreference.update({
        where: { userAccountId: principal.userAccountId },
        data: {
          ...(dto.in_app_enabled !== undefined ? { inAppEnabled: dto.in_app_enabled } : {}),
          ...(dto.email_enabled !== undefined ? { emailEnabled: dto.email_enabled } : {}),
          ...(dto.sms_enabled !== undefined ? { smsEnabled: dto.sms_enabled } : {}),
          ...(dto.push_enabled !== undefined ? { pushEnabled: dto.push_enabled } : {}),
          ...(dto.enabled_categories !== undefined
            ? { enabledCategories: dto.enabled_categories }
            : {}),
          ...(dto.quiet_hours_start !== undefined
            ? { quietHoursStart: dto.quiet_hours_start }
            : {}),
          ...(dto.quiet_hours_end !== undefined ? { quietHoursEnd: dto.quiet_hours_end } : {}),
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'notification_preferences.update',
          resourceType: 'notification_preference',
          resourceId: saved.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            in_app_enabled: saved.inAppEnabled,
            email_enabled: saved.emailEnabled,
            sms_enabled: saved.smsEnabled,
            push_enabled: saved.pushEnabled,
          },
        },
        tx,
      );

      return saved;
    });

    return this.toPreferenceView(updated);
  }

  async listNotifications(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<NotificationView>> {
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const decoded = pagination.cursor ? decodeCursor(pagination.cursor) : null;
    const sortDate = decoded ? new Date(decoded.sortValue) : null;

    const rows = await this.prisma.notification.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(decoded && sortDate && !Number.isNaN(sortDate.getTime())
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: sortDate } },
                    { createdAt: sortDate, id: { lt: decoded.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toNotificationView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async markNotificationRead(
    principal: AuthenticatedPrincipal,
    notificationId: string,
  ): Promise<NotificationView> {
    this.accessPolicy.assertCitizenSelf(principal);
    if (!UUID_REGEX.test(notificationId)) {
      throw new ResourceNotFoundException();
    }

    const existing = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      existing.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'notification',
        resourceId: notificationId,
        action: 'notification.read',
      },
    );

    const updated = await this.prisma.notification.update({
      where: { id: existing.id },
      data: {
        status: NotificationStatus.read,
        readAt: existing.readAt ?? new Date(),
      },
    });

    return this.toNotificationView(updated);
  }

  /**
   * Dispatches generic zero-PHI preventive notifications while enforcing consent,
   * channel preferences, quiet hours, and in-app fallback preservation (SYSTEM_DESIGN.md §13, T-042).
   */
  async dispatchPreventiveNotification(
    input: DispatchPreventiveNotificationInput,
  ): Promise<NotificationView[]> {
    assertZeroPhiNotificationPayload(input.titleKey, input.bodyKey, input.inAppTargetPath);

    const account = await this.prisma.userAccount.findUnique({
      where: { id: input.userAccountId },
      select: { timezone: true },
    });
    if (!account) {
      throw new ResourceNotFoundException();
    }

    const pref = await this.ensureNotificationPreference(input.userAccountId);
    const referenceTime = input.referenceTime ?? new Date();
    const createdNotifications: Notification[] = [];

    if (pref.inAppEnabled) {
      const inAppIdempotencyKey = input.idempotencyKeyPrefix
        ? `${input.idempotencyKeyPrefix}:in_app`
        : null;
      const existingInApp = inAppIdempotencyKey
        ? await this.prisma.notification.findUnique({
            where: { idempotencyKey: inAppIdempotencyKey },
          })
        : null;

      if (existingInApp) {
        createdNotifications.push(existingInApp);
      } else {
        const inApp = await this.prisma.notification.create({
          data: {
            userAccountId: input.userAccountId,
            category: input.category,
            channel: NotificationChannel.in_app,
            titleKey: input.titleKey,
            bodyKey: input.bodyKey,
            inAppTargetPath: input.inAppTargetPath ?? null,
            sourceReference: input.sourceReference ?? null,
            contentTemplateVersion: NOTIFICATION_TEMPLATE_VERSION,
            status: NotificationStatus.delivered,
            scheduledAt: referenceTime,
            sentAt: referenceTime,
            idempotencyKey: inAppIdempotencyKey,
          },
        });
        createdNotifications.push(inApp);
      }
    }

    const requestedExternal = input.externalChannels ?? [];
    if (requestedExternal.length > 0) {
      const activeNotifConsent = await this.consentService.verifyActiveConsent(
        input.userAccountId,
        'notifications_delivery',
        'v1',
      );
      const inQuietHours = this.isWithinQuietHours(
        referenceTime,
        account.timezone,
        pref.quietHoursStart,
        pref.quietHoursEnd,
      );
      const categoryEnabled =
        pref.enabledCategories.length === 0 || pref.enabledCategories.includes(input.category);

      for (const extChannel of requestedExternal) {
        const channelOptedIn =
          (extChannel === 'email' && pref.emailEnabled) ||
          (extChannel === 'sms' && pref.smsEnabled) ||
          (extChannel === 'push' && pref.pushEnabled);

        const extKey = input.idempotencyKeyPrefix
          ? `${input.idempotencyKeyPrefix}:${extChannel}`
          : null;
        if (extKey) {
          const existingExt = await this.prisma.notification.findUnique({
            where: { idempotencyKey: extKey },
          });
          if (existingExt) {
            createdNotifications.push(existingExt);
            continue;
          }
        }

        if (!activeNotifConsent || !channelOptedIn || !categoryEnabled || inQuietHours) {
          const suppressed = await this.prisma.notification.create({
            data: {
              userAccountId: input.userAccountId,
              category: input.category,
              channel: extChannel as NotificationChannel,
              titleKey: input.titleKey,
              bodyKey: input.bodyKey,
              inAppTargetPath: input.inAppTargetPath ?? null,
              sourceReference: input.sourceReference ?? null,
              contentTemplateVersion: NOTIFICATION_TEMPLATE_VERSION,
              status: NotificationStatus.suppressed,
              scheduledAt: referenceTime,
              failureCode: !activeNotifConsent
                ? 'CONSENT_MISSING_OR_WITHDRAWN'
                : inQuietHours
                  ? 'QUIET_HOURS_SUPPRESSED'
                  : 'PREFERENCE_DISABLED',
              idempotencyKey: extKey,
            },
          });
          createdNotifications.push(suppressed);
          continue;
        }

        const pendingRow = await this.prisma.notification.create({
          data: {
            userAccountId: input.userAccountId,
            category: input.category,
            channel: extChannel as NotificationChannel,
            titleKey: input.titleKey,
            bodyKey: input.bodyKey,
            inAppTargetPath: input.inAppTargetPath ?? null,
            sourceReference: input.sourceReference ?? null,
            contentTemplateVersion: NOTIFICATION_TEMPLATE_VERSION,
            status: NotificationStatus.pending,
            scheduledAt: referenceTime,
            idempotencyKey: extKey,
          },
        });

        const deliveredRow = await this.deliverPendingExternalNotification(pendingRow.id);
        createdNotifications.push(deliveredRow);
      }
    }

    return createdNotifications.map((row) => this.toNotificationView(row));
  }

  /**
   * Re-verifies active `notifications_delivery` consent before invoking external channel adapter
   * (used both inline and by the BullMQ `notification-delivery` worker — T-044).
   */
  async deliverPendingExternalNotification(notificationId: string): Promise<Notification> {
    const existing = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing) {
      throw new ResourceNotFoundException();
    }
    if (
      existing.channel === NotificationChannel.in_app ||
      existing.status === NotificationStatus.sent ||
      existing.status === NotificationStatus.delivered
    ) {
      return existing;
    }

    const activeConsent = await this.consentService.verifyActiveConsent(
      existing.userAccountId,
      'notifications_delivery',
      'v1',
    );

    if (!activeConsent) {
      return this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          status: NotificationStatus.suppressed,
          failureCode: 'CONSENT_WITHDRAWN',
        },
      });
    }

    const dispatchResult = await this.notificationAdapter.sendExternalNotification({
      notificationId: existing.id,
      channel: existing.channel as ExternalNotificationChannel,
      category: existing.category,
      titleKey: existing.titleKey,
      bodyKey: existing.bodyKey,
      contentTemplateVersion: existing.contentTemplateVersion,
      inAppTargetPath: existing.inAppTargetPath,
      idempotencyKey: existing.idempotencyKey ?? existing.id,
    });

    if (dispatchResult.delivered) {
      return this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          status: NotificationStatus.sent,
          sentAt: new Date(),
          providerMessageId: dispatchResult.providerMessageId,
          failureCode: null,
        },
      });
    }

    return this.prisma.notification.update({
      where: { id: existing.id },
      data: {
        status: NotificationStatus.failed,
        failedAt: new Date(),
        retryCount: { increment: 1 },
        failureCode: dispatchResult.failureCode ?? 'PROVIDER_DELIVERY_FAILED',
      },
    });
  }

  async getPersonalTrends(
    principal: AuthenticatedPrincipal,
    query: GetTrendsQueryDto,
  ): Promise<PersonalTrendsView> {
    this.accessPolicy.assertCitizenSelf(principal);

    const periodDays = query.period_days ?? 30;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const [healthInputs, riskAssessments, followUps] = await Promise.all([
      this.prisma.healthInput.findMany({
        where: {
          userAccountId: principal.userAccountId,
          observedAt: { gte: periodStart, lte: periodEnd },
        },
        orderBy: [{ observedAt: 'asc' }],
        take: 250,
      }),
      this.prisma.riskAssessment.findMany({
        where: {
          userAccountId: principal.userAccountId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        include: {
          riskUseCase: true,
          ruleModelVersion: true,
        },
        orderBy: [{ createdAt: 'asc' }],
        take: 100,
      }),
      this.prisma.providerFollowUp.findMany({
        where: {
          citizenUserId: principal.userAccountId,
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        orderBy: [{ createdAt: 'asc' }],
        take: 100,
      }),
    ]);

    let regionalObservations: PersonalTrendsView['regional_environmental_observations'] = [];
    const envConsent = await this.consentService.verifyActiveConsent(
      principal.userAccountId,
      'environmental_context',
      'v1',
    );
    if (envConsent) {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userAccountId: principal.userAccountId },
        select: { administrativeAreaCode: true },
      });
      if (profile?.administrativeAreaCode) {
        const obsRows = await this.prisma.environmentalObservation.findMany({
          where: {
            locationAreaId: profile.administrativeAreaCode,
            observedAt: { gte: periodStart, lte: periodEnd },
          },
          include: { dataSource: true },
          orderBy: [{ observedAt: 'asc' }],
          take: 100,
        });
        regionalObservations = obsRows.map((obs) => ({
          id: obs.id,
          observation_type: obs.observationType,
          location_area_id: obs.locationAreaId,
          value: obs.value,
          unit: obs.unit,
          quality_status: obs.qualityStatus,
          observed_at: obs.observedAt.toISOString(),
          source_name: obs.dataSource.name,
          provenance_type: 'imported_regional_environmental',
        }));
      }
    }

    return {
      period_days: periodDays,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      non_diagnostic_disclaimer: REPORT_NON_DIAGNOSTIC_DISCLAIMER,
      self_reported_health_inputs: healthInputs.map((h) => ({
        id: h.id,
        field_code: h.fieldCode,
        category: h.category,
        value: h.numericValue !== null ? h.numericValue : h.textValue,
        unit: h.unit,
        observed_at: h.observedAt.toISOString(),
        status: h.status,
        source_type: h.sourceType,
      })),
      rule_generated_risk_indicators: riskAssessments.map((r) => {
        const meta =
          r.safetyMetadata &&
          typeof r.safetyMetadata === 'object' &&
          !Array.isArray(r.safetyMetadata)
            ? (r.safetyMetadata as Record<string, unknown>)
            : {};
        const priorLevel =
          typeof meta.prior_level === 'string' ? (meta.prior_level as RiskLevel) : null;
        return {
          id: r.id,
          use_case: r.riskUseCase.code,
          rule_model_version: r.ruleModelVersion.version,
          status: r.status,
          level: r.level,
          historical_level: r.level ?? priorLevel,
          calculated_at: r.calculatedAt ? r.calculatedAt.toISOString() : null,
          limitations: r.limitations,
          provenance_type: 'rule_generated',
        };
      }),
      provider_recorded_follow_ups: followUps.map((f) => ({
        id: f.id,
        action_type: f.actionType,
        recommended_follow_up_at: f.recommendedFollowUpAt
          ? f.recommendedFollowUpAt.toISOString()
          : null,
        created_at: f.createdAt.toISOString(),
        provenance_type: 'provider_recorded',
      })),
      regional_environmental_observations: regionalObservations,
    };
  }

  async requestReport(
    principal: AuthenticatedPrincipal,
    dto: RequestReportDto,
  ): Promise<ReportView> {
    this.accessPolicy.assertCitizenSelf(principal);

    await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'report_generation',
      'v1',
    );

    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);

    if (
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime()) ||
      periodEnd.getTime() <= periodStart.getTime() ||
      periodEnd.getTime() - periodStart.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      throw new ValidationDomainException('Invalid report date range.', [
        { field: 'period_end', reason: 'invalid_or_excessive_date_range' },
      ]);
    }

    const categories =
      dto.included_categories && dto.included_categories.length > 0
        ? dto.included_categories
        : [...ALLOWED_REPORT_CATEGORIES];

    const invalidCategories = categories.filter(
      (c) => !(ALLOWED_REPORT_CATEGORIES as readonly string[]).includes(c),
    );
    if (invalidCategories.length > 0) {
      throw new ValidationDomainException('Unapproved report category.', [
        { field: 'included_categories', reason: 'unapproved_report_category' },
      ]);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          userAccountId: principal.userAccountId,
          status: ReportStatus.queued,
          periodStart,
          periodEnd,
          includedCategories: categories,
          sourceSummary: {},
          templateVersion: REPORT_TEMPLATE_VERSION,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'report.request',
          resourceType: 'report',
          resourceId: report.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: 'report_generation',
          metadata: {
            template_version: REPORT_TEMPLATE_VERSION,
            included_categories: categories,
            deferred: Boolean(dto.defer_generation),
          },
        },
        tx,
      );

      return report;
    });

    if (dto.defer_generation) {
      return this.toReportView(created, null);
    }

    const generated = await this.generateReportById(created.id);
    return this.toReportView(generated, null);
  }

  /**
   * Generates the printable report bundle, uploads to private S3/MinIO object storage,
   * and transitions `queued -> generating -> ready`.
   * Re-verifies active `report_generation` consent before generating (ACCESS_CONTROL.md §8.1, T-044).
   */
  async generateReportById(reportId: string): Promise<Report> {
    const existing = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!existing) {
      throw new ResourceNotFoundException();
    }
    if (existing.status === ReportStatus.ready) {
      return existing;
    }

    const activeConsent = await this.consentService.verifyActiveConsent(
      existing.userAccountId,
      'report_generation',
      'v1',
    );

    if (!activeConsent) {
      const failed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.report.update({
          where: { id: existing.id },
          data: {
            status: ReportStatus.failed,
            failureCode: 'CONSENT_WITHDRAWN',
          },
        });

        await this.auditService.record(
          {
            actorId: null,
            actorType: ActorType.service,
            action: 'report.generate_skipped',
            resourceType: 'report',
            resourceId: existing.id,
            outcome: AuditOutcome.denied,
            purposeCode: 'report_generation',
            metadata: {
              reason: 'consent_withdrawn_before_report_generation',
            },
          },
          tx,
        );

        return updated;
      });
      return failed;
    }

    await this.prisma.report.update({
      where: { id: existing.id },
      data: { status: ReportStatus.generating },
    });

    const categories = new Set(existing.includedCategories);

    const [healthInputs, riskAssessments, followUps] = await Promise.all([
      categories.has('health_inputs')
        ? this.prisma.healthInput.findMany({
            where: {
              userAccountId: existing.userAccountId,
              observedAt: { gte: existing.periodStart, lte: existing.periodEnd },
            },
            orderBy: [{ observedAt: 'desc' }],
            take: 200,
          })
        : Promise.resolve([]),
      categories.has('risk_assessments')
        ? this.prisma.riskAssessment.findMany({
            where: {
              userAccountId: existing.userAccountId,
              createdAt: { gte: existing.periodStart, lte: existing.periodEnd },
            },
            include: {
              riskUseCase: true,
              ruleModelVersion: true,
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 100,
          })
        : Promise.resolve([]),
      categories.has('provider_follow_ups')
        ? this.prisma.providerFollowUp.findMany({
            where: {
              citizenUserId: existing.userAccountId,
              createdAt: { gte: existing.periodStart, lte: existing.periodEnd },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 100,
          })
        : Promise.resolve([]),
    ]);

    const sourceSummary = {
      self_reported_inputs_count: healthInputs.length,
      rule_generated_assessments_count: riskAssessments.length,
      provider_recorded_follow_ups_count: followUps.length,
      clinically_confirmed_records_count: 0,
      provenance_categories_present: [
        ...(healthInputs.length > 0 ? ['self_reported'] : []),
        ...(riskAssessments.length > 0 ? ['generated_rule_indicator'] : []),
        ...(followUps.length > 0 ? ['provider_recorded'] : []),
      ],
    };

    const printableArtifact = {
      report_id: existing.id,
      template_version: existing.templateVersion,
      generated_at: new Date().toISOString(),
      period: {
        start: existing.periodStart.toISOString(),
        end: existing.periodEnd.toISOString(),
      },
      non_diagnostic_disclaimer: REPORT_NON_DIAGNOSTIC_DISCLAIMER,
      provenance_summary: sourceSummary,
      sections: {
        self_reported_health_inputs: healthInputs.map((h) => ({
          field_code: h.fieldCode,
          category: h.category,
          value: h.numericValue !== null ? h.numericValue : h.textValue,
          unit: h.unit,
          observed_at: h.observedAt.toISOString(),
          status: h.status,
          provenance: 'self_reported',
        })),
        rule_generated_preventive_indicators: riskAssessments.map((r) => ({
          use_case: r.riskUseCase.code,
          rule_model_version: r.ruleModelVersion.version,
          status: r.status,
          level: r.level,
          calculated_at: r.calculatedAt ? r.calculatedAt.toISOString() : null,
          contributing_factors: r.contributingFactors,
          limitations: r.limitations,
          recommended_next_steps: r.recommendedNextSteps,
          provenance: 'generated_rule_indicator_non_diagnostic',
        })),
        provider_recorded_follow_ups: followUps.map((f) => ({
          action_type: f.actionType,
          structured_notes: f.structuredNotes,
          recommended_follow_up_at: f.recommendedFollowUpAt
            ? f.recommendedFollowUpAt.toISOString()
            : null,
          recorded_at: f.createdAt.toISOString(),
          provenance: 'provider_recorded_follow_up',
        })),
        clinically_confirmed_records: [],
      },
    };

    const opaqueKey = this.objectStorage.buildOpaqueReportKey('json');

    try {
      const storedObject = await this.objectStorage.putPrivateObject({
        key: opaqueKey,
        body: JSON.stringify(printableArtifact, null, 2),
        contentType: 'application/json',
        metadata: {
          'template-version': existing.templateVersion,
        },
      });

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      return await this.prisma.$transaction(async (tx) => {
        const ready = await tx.report.update({
          where: { id: existing.id },
          data: {
            status: ReportStatus.ready,
            sourceSummary: sourceSummary as Prisma.InputJsonValue,
            objectStorageKey: storedObject.key,
            contentSha256: storedObject.contentSha256,
            failureCode: null,
            expiresAt,
          },
        });

        await this.auditService.record(
          {
            actorId: existing.userAccountId,
            actorType: ActorType.service,
            action: 'report.generate',
            resourceType: 'report',
            resourceId: ready.id,
            outcome: AuditOutcome.succeeded,
            purposeCode: 'report_generation',
            metadata: {
              template_version: ready.templateVersion,
              status: ready.status,
            },
          },
          tx,
        );

        return ready;
      });
    } catch {
      const failed = await this.prisma.report.update({
        where: { id: existing.id },
        data: {
          status: ReportStatus.failed,
          failureCode: 'STORAGE_WRITE_FAILED',
        },
      });
      return failed;
    }
  }

  async listReports(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ReportView>> {
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const decoded = pagination.cursor ? decodeCursor(pagination.cursor) : null;
    const sortDate = decoded ? new Date(decoded.sortValue) : null;

    const rows = await this.prisma.report.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(decoded && sortDate && !Number.isNaN(sortDate.getTime())
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: sortDate } },
                    { createdAt: sortDate, id: { lt: decoded.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toReportView(row, null));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async getReportById(principal: AuthenticatedPrincipal, reportId: string): Promise<ReportView> {
    if (!UUID_REGEX.test(reportId)) {
      throw new ResourceNotFoundException();
    }

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new ResourceNotFoundException();
    }

    const now = new Date();
    const isOwner = report.userAccountId === principal.userAccountId;

    if (!isOwner) {
      const activeGrant = await this.prisma.reportAccess.findFirst({
        where: {
          reportId: report.id,
          grantedToUserId: principal.userAccountId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });

      if (!activeGrant) {
        await this.auditService.record({
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'report.access',
          resourceType: 'report',
          resourceId: report.id,
          outcome: AuditOutcome.denied,
          metadata: {
            reason: 'unauthorized_or_expired_report_access',
          },
        });
        throw new ResourceNotFoundException();
      }
    }

    let download: ReportView['download'] = null;
    if (
      report.status === ReportStatus.ready &&
      report.objectStorageKey &&
      (!report.expiresAt || report.expiresAt > now)
    ) {
      const signed = await this.objectStorage.createScopedDownloadUrl({
        key: report.objectStorageKey,
        expiresInSeconds: 300,
        responseContentDisposition: `attachment; filename="albo-preventive-summary-${report.id}.json"`,
      });
      download = {
        url: signed.downloadUrl,
        expires_in_seconds: signed.expiresInSeconds,
        expires_at: signed.expiresAt,
      };
    }

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'report.access',
      resourceType: 'report',
      resourceId: report.id,
      outcome: AuditOutcome.allowed,
      metadata: {
        access_mode: isOwner ? 'owner' : 'explicit_grant',
        download_url_issued: Boolean(download),
      },
    });

    return this.toReportView(report, download);
  }

  async grantReportAccess(
    principal: AuthenticatedPrincipal,
    reportId: string,
    dto: GrantReportAccessDto,
  ): Promise<ReportAccessGrantView> {
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(reportId)) {
      throw new ResourceNotFoundException();
    }

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      report.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'report',
        resourceId: reportId,
        action: 'report.share_grant',
      },
    );

    const now = new Date();
    const expiresAt = new Date(dto.expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() - now.getTime() > MAX_REPORT_ACCESS_TTL_MS
    ) {
      throw new ValidationDomainException('Invalid report access expiry.', [
        { field: 'expires_at', reason: 'must_be_future_within_30_days' },
      ]);
    }

    if (dto.granted_to_user_id === principal.userAccountId) {
      throw new ConflictDomainException('Report owners already have access to their own reports.');
    }

    const targetAccount = await this.prisma.userAccount.findUnique({
      where: { id: dto.granted_to_user_id },
      select: { id: true, accountStatus: true },
    });
    if (!targetAccount || targetAccount.accountStatus !== 'active') {
      throw new ResourceNotFoundException();
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.reportAccess.create({
        data: {
          reportId: report.id,
          grantedToUserId: dto.granted_to_user_id,
          grantedByUserId: principal.userAccountId,
          purpose: dto.purpose,
          expiresAt,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'report.share_grant',
          resourceType: 'report_access',
          resourceId: grant.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            report_id: report.id,
            granted_to_user_id: dto.granted_to_user_id,
            expires_at: expiresAt.toISOString(),
          },
        },
        tx,
      );

      return grant;
    });

    return this.toReportAccessView(created);
  }

  async revokeReportAccess(
    principal: AuthenticatedPrincipal,
    reportId: string,
    accessId: string,
  ): Promise<ReportAccessGrantView> {
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(reportId) || !UUID_REGEX.test(accessId)) {
      throw new ResourceNotFoundException();
    }

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      report.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'report',
        resourceId: reportId,
        action: 'report.share_revoke',
      },
    );

    const existingGrant = await this.prisma.reportAccess.findFirst({
      where: {
        id: accessId,
        reportId: report.id,
      },
    });
    if (!existingGrant) {
      throw new ResourceNotFoundException();
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reportAccess.update({
        where: { id: existingGrant.id },
        data: {
          revokedAt: existingGrant.revokedAt ?? new Date(),
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'report.share_revoke',
          resourceType: 'report_access',
          resourceId: updated.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            report_id: report.id,
            granted_to_user_id: updated.grantedToUserId,
          },
        },
        tx,
      );

      return updated;
    });

    return this.toReportAccessView(revoked);
  }

  private async ensureNotificationPreference(
    userAccountId: string,
  ): Promise<NotificationPreference> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userAccountId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.notificationPreference.create({
      data: {
        userAccountId,
        inAppEnabled: true,
        emailEnabled: false,
        smsEnabled: false,
        pushEnabled: false,
        enabledCategories: [...ALLOWED_NOTIFICATION_CATEGORIES],
      },
    });
  }

  private isWithinQuietHours(
    timestamp: Date,
    timezone: string,
    quietStart: string | null,
    quietEnd: string | null,
  ): boolean {
    if (!quietStart || !quietEnd || quietStart === quietEnd) {
      return false;
    }

    let currentMinutes: number;
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone || 'Africa/Kigali',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const formatted = formatter.format(timestamp);
      const [hStr, mStr] = formatted.split(':');
      currentMinutes = Number(hStr) * 60 + Number(mStr);
    } catch {
      currentMinutes = timestamp.getUTCHours() * 60 + timestamp.getUTCMinutes();
    }

    const [startH, startM] = quietStart.split(':').map(Number);
    const [endH, endM] = quietEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    // Wraps past midnight (e.g., 21:00 -> 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  private toPreferenceView(row: NotificationPreference): NotificationPreferenceView {
    return {
      user_account_id: row.userAccountId,
      in_app_enabled: row.inAppEnabled,
      email_enabled: row.emailEnabled,
      sms_enabled: row.smsEnabled,
      push_enabled: row.pushEnabled,
      enabled_categories: row.enabledCategories,
      quiet_hours_start: row.quietHoursStart,
      quiet_hours_end: row.quietHoursEnd,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toNotificationView(row: Notification): NotificationView {
    return {
      id: row.id,
      category: row.category,
      channel: row.channel,
      title_key: row.titleKey,
      body_key: row.bodyKey,
      in_app_target_path: row.inAppTargetPath,
      content_template_version: row.contentTemplateVersion,
      status: row.status,
      scheduled_at: row.scheduledAt.toISOString(),
      sent_at: row.sentAt ? row.sentAt.toISOString() : null,
      read_at: row.readAt ? row.readAt.toISOString() : null,
      failure_code: row.failureCode,
      created_at: row.createdAt.toISOString(),
    };
  }

  private toReportView(row: Report, download: ReportView['download']): ReportView {
    const sourceSummary =
      row.sourceSummary &&
      typeof row.sourceSummary === 'object' &&
      !Array.isArray(row.sourceSummary)
        ? (row.sourceSummary as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      user_account_id: row.userAccountId,
      status: row.status,
      period_start: row.periodStart.toISOString(),
      period_end: row.periodEnd.toISOString(),
      included_categories: row.includedCategories,
      source_summary: sourceSummary,
      template_version: row.templateVersion,
      content_sha256: row.contentSha256,
      failure_code: row.failureCode,
      non_diagnostic_disclaimer: REPORT_NON_DIAGNOSTIC_DISCLAIMER,
      download,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toReportAccessView(row: ReportAccess): ReportAccessGrantView {
    return {
      id: row.id,
      report_id: row.reportId,
      granted_to_user_id: row.grantedToUserId,
      granted_by_user_id: row.grantedByUserId,
      purpose: row.purpose,
      expires_at: row.expiresAt.toISOString(),
      revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
