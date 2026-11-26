import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ActorType,
  AssignmentStatus,
  AuditOutcome,
  DataExportRequest,
  DeletionRequestStatus,
  ExportRequestStatus,
  HealthInputStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { ResourceNotFoundException, ValidationDomainException } from '@common/errors/app.exception';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { PrismaService } from '@database/prisma.service';
import { AuditService } from '@modules/audit/audit.service';
import { AccessPolicyService } from './access-policy.service';
import { UpdateProfileDto } from './dto/me.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELETION_GRACE_PERIOD_DAYS = 30;
const EXPORT_EXPIRY_DAYS = 7;
const MIN_ALLOWED_BIRTH_YEAR = 1900;
const MIN_ADULT_AGE_YEARS = 18;

export interface SafeCurrentUserView {
  id: string;
  account_status: AccountStatus;
  preferred_language: string;
  timezone: string;
  roles: RoleCode[];
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfileView {
  user_account_id: string;
  display_name: string | null;
  birth_year: number | null;
  administrative_area_code: string | null;
  preferred_language: string;
  timezone: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountDeletionRequestView {
  id: string;
  user_account_id: string;
  status: DeletionRequestStatus;
  account_status: AccountStatus;
  requested_at: string;
  grace_period_ends_at: string;
}

export interface PortableDataSummary {
  schema_version: 'v1';
  generated_at: string;
  account: SafeCurrentUserView;
  profile: {
    display_name: string | null;
    birth_year: number | null;
    administrative_area_code: string | null;
  };
  consents: Array<{
    id: string;
    purpose_code: string;
    version: string;
    status: string;
    granted_at: string | null;
    withdrawn_at: string | null;
  }>;
  health_inputs: Array<{
    id: string;
    category: string;
    field_code: string;
    numeric_value: number | null;
    text_value: string | null;
    unit: string | null;
    observed_at: string;
    source_type: string;
    status: string;
  }>;
  risk_assessments: Array<{
    id: string;
    use_case: string;
    rule_model_version: string;
    status: string;
    level: string | null;
    calculated_at: string | null;
    limitations: string[];
  }>;
  notification_preferences: {
    in_app_enabled: boolean;
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    enabled_categories: string[];
  } | null;
}

export interface DataExportView {
  id: string;
  user_account_id: string;
  status: ExportRequestStatus;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  summary?: PortableDataSummary;
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getMe(principal: AuthenticatedPrincipal): Promise<SafeCurrentUserView> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: principal.userAccountId },
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
      },
    });

    if (!account) {
      throw new ResourceNotFoundException('User account was not found.');
    }

    return {
      id: account.id,
      account_status: account.accountStatus,
      preferred_language: account.preferredLanguage,
      timezone: account.timezone,
      roles: account.roles.map((r) => r.role.code),
      onboarding_completed_at: account.onboardingCompletedAt
        ? account.onboardingCompletedAt.toISOString()
        : null,
      created_at: account.createdAt.toISOString(),
      updated_at: account.updatedAt.toISOString(),
    };
  }

  async getProfile(principal: AuthenticatedPrincipal): Promise<UserProfileView> {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: principal.userAccountId },
      include: { profile: true },
    });

    if (!account) {
      throw new ResourceNotFoundException('User account was not found.');
    }

    const profile = account.profile;
    return {
      user_account_id: account.id,
      display_name: profile?.displayName ?? null,
      birth_year: profile?.birthYear ?? null,
      administrative_area_code: profile?.administrativeAreaCode ?? null,
      preferred_language: account.preferredLanguage,
      timezone: account.timezone,
      onboarding_completed_at: account.onboardingCompletedAt
        ? account.onboardingCompletedAt.toISOString()
        : null,
      created_at: (profile?.createdAt ?? account.createdAt).toISOString(),
      updated_at: (profile?.updatedAt ?? account.updatedAt).toISOString(),
    };
  }

  async updateProfile(
    principal: AuthenticatedPrincipal,
    dto: UpdateProfileDto,
  ): Promise<UserProfileView> {
    if (dto.birth_year !== undefined && dto.birth_year !== null) {
      this.validateAdultBirthYear(dto.birth_year);
    }

    const updatedFieldKeys = Object.entries(dto)
      .filter(([, val]) => val !== undefined)
      .map(([key]) => key);

    return this.prisma.$transaction(async (tx) => {
      const existingAccount = await tx.userAccount.findUnique({
        where: { id: principal.userAccountId },
        include: { profile: true },
      });

      if (!existingAccount) {
        throw new ResourceNotFoundException('User account was not found.');
      }

      const now = new Date();
      const accountUpdateData: Prisma.UserAccountUpdateInput = {};
      if (dto.preferred_language !== undefined) {
        accountUpdateData.preferredLanguage = dto.preferred_language;
      }
      if (dto.timezone !== undefined) {
        accountUpdateData.timezone = dto.timezone;
      }
      if (dto.mark_onboarding_completed === true && !existingAccount.onboardingCompletedAt) {
        accountUpdateData.onboardingCompletedAt = now;
      }

      const updatedAccount =
        Object.keys(accountUpdateData).length > 0
          ? await tx.userAccount.update({
              where: { id: principal.userAccountId },
              data: accountUpdateData,
            })
          : existingAccount;

      const profileUpdateData: Prisma.UserProfileUpdateInput = {};
      const profileCreateData: Prisma.UserProfileUncheckedCreateInput = {
        userAccountId: principal.userAccountId,
      };

      if (dto.display_name !== undefined) {
        const cleanDisplayName = dto.display_name === null ? null : dto.display_name.trim() || null;
        profileUpdateData.displayName = cleanDisplayName;
        profileCreateData.displayName = cleanDisplayName;
      }
      if (dto.birth_year !== undefined) {
        profileUpdateData.birthYear = dto.birth_year;
        profileCreateData.birthYear = dto.birth_year;
      }
      if (dto.administrative_area_code !== undefined) {
        const cleanArea =
          dto.administrative_area_code === null
            ? null
            : dto.administrative_area_code.trim() || null;
        profileUpdateData.administrativeAreaCode = cleanArea;
        profileCreateData.administrativeAreaCode = cleanArea;
      }

      const upsertedProfile = await tx.userProfile.upsert({
        where: { userAccountId: principal.userAccountId },
        update: profileUpdateData,
        create: profileCreateData,
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'profile.updated',
          resourceType: 'user_profile',
          resourceId: upsertedProfile.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            updated_fields: updatedFieldKeys,
          },
        },
        tx,
      );

      return {
        user_account_id: updatedAccount.id,
        display_name: upsertedProfile.displayName,
        birth_year: upsertedProfile.birthYear,
        administrative_area_code: upsertedProfile.administrativeAreaCode,
        preferred_language: updatedAccount.preferredLanguage,
        timezone: updatedAccount.timezone,
        onboarding_completed_at: updatedAccount.onboardingCompletedAt
          ? updatedAccount.onboardingCompletedAt.toISOString()
          : null,
        created_at: upsertedProfile.createdAt.toISOString(),
        updated_at: upsertedProfile.updatedAt.toISOString(),
      };
    });
  }

  async requestAccountDeletion(
    principal: AuthenticatedPrincipal,
  ): Promise<AccountDeletionRequestView> {
    const now = new Date();
    const gracePeriodEndsAt = new Date(
      now.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.prisma.$transaction(async (tx) => {
      const deletionReq = await tx.accountDeletionRequest.create({
        data: {
          userAccountId: principal.userAccountId,
          status: DeletionRequestStatus.grace_period,
          requestedAt: now,
          gracePeriodEndsAt,
        },
      });

      await tx.userAccount.update({
        where: { id: principal.userAccountId },
        data: {
          accountStatus: AccountStatus.pending_deletion,
        },
      });

      // Immediately terminate active provider access and report shares (DATA_PRIVACY.md §8.1)
      await tx.providerAssignment.updateMany({
        where: {
          OR: [
            { citizenUserId: principal.userAccountId },
            { providerUserId: principal.userAccountId },
          ],
          status: AssignmentStatus.active,
        },
        data: {
          status: AssignmentStatus.revoked,
          endsAt: now,
        },
      });

      await tx.reportAccess.updateMany({
        where: {
          OR: [
            { grantedByUserId: principal.userAccountId },
            { grantedToUserId: principal.userAccountId },
          ],
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'account.deletion_requested',
          resourceType: 'account_deletion_request',
          resourceId: deletionReq.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            grace_period_days: DELETION_GRACE_PERIOD_DAYS,
          },
        },
        tx,
      );

      return {
        id: deletionReq.id,
        user_account_id: principal.userAccountId,
        status: deletionReq.status,
        account_status: AccountStatus.pending_deletion,
        requested_at: deletionReq.requestedAt.toISOString(),
        grace_period_ends_at: deletionReq.gracePeriodEndsAt.toISOString(),
      };
    });
  }

  async createDataExport(principal: AuthenticatedPrincipal): Promise<DataExportView> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const exportReq = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dataExportRequest.create({
        data: {
          userAccountId: principal.userAccountId,
          status: ExportRequestStatus.ready,
          requestedAt: now,
          completedAt: now,
          expiresAt,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'account.data_export_requested',
          resourceType: 'data_export_request',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
        },
        tx,
      );

      return created;
    });

    const summary = await this.buildPortableDataSummary(principal.userAccountId);
    return this.toDataExportView(exportReq, summary);
  }

  async listDataExports(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<DataExportView>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
    const cursorFilter = this.buildExportCursorFilter(pagination.cursor);

    const rows = await this.prisma.dataExportRequest.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const summary = await this.buildPortableDataSummary(principal.userAccountId);
    const mapped = rows.map((row) => this.toDataExportView(row, summary));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.requested_at,
    }));
  }

  async getDataExportById(
    principal: AuthenticatedPrincipal,
    exportId: string,
  ): Promise<DataExportView> {
    if (!UUID_REGEX.test(exportId)) {
      throw new ResourceNotFoundException();
    }

    const row = await this.prisma.dataExportRequest.findUnique({
      where: { id: exportId },
    });

    if (!row) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(row.userAccountId, principal.userAccountId, {
      action: 'account.data_export_read',
      resourceType: 'data_export_request',
      resourceId: exportId,
    });

    const summary = await this.buildPortableDataSummary(principal.userAccountId);
    return this.toDataExportView(row, summary);
  }

  private validateAdultBirthYear(birthYear: number): void {
    const currentYear = new Date().getUTCFullYear();
    const ageYears = currentYear - birthYear;

    if (
      !Number.isInteger(birthYear) ||
      birthYear < MIN_ALLOWED_BIRTH_YEAR ||
      birthYear > currentYear ||
      ageYears < MIN_ADULT_AGE_YEARS
    ) {
      throw new ValidationDomainException('Albo requires users to be adults aged 18 or older.', [
        { field: 'birth_year', reason: 'must_be_adult_18_plus' },
      ]);
    }
  }

  private async buildPortableDataSummary(userAccountId: string): Promise<PortableDataSummary> {
    const [account, consents, healthInputs, assessments] = await Promise.all([
      this.prisma.userAccount.findUnique({
        where: { id: userAccountId },
        include: {
          profile: true,
          notificationPreference: true,
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      }),
      this.prisma.consentRecord.findMany({
        where: { userAccountId },
        include: { consentPurpose: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.healthInput.findMany({
        where: { userAccountId, status: HealthInputStatus.active },
        orderBy: [{ observedAt: 'desc' }],
        take: 200,
      }),
      this.prisma.riskAssessment.findMany({
        where: { userAccountId },
        include: { riskUseCase: true, ruleModelVersion: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      }),
    ]);

    if (!account) {
      throw new ResourceNotFoundException('User account was not found.');
    }

    return {
      schema_version: 'v1',
      generated_at: new Date().toISOString(),
      account: {
        id: account.id,
        account_status: account.accountStatus,
        preferred_language: account.preferredLanguage,
        timezone: account.timezone,
        roles: account.roles.map((r) => r.role.code),
        onboarding_completed_at: account.onboardingCompletedAt
          ? account.onboardingCompletedAt.toISOString()
          : null,
        created_at: account.createdAt.toISOString(),
        updated_at: account.updatedAt.toISOString(),
      },
      profile: {
        display_name: account.profile?.displayName ?? null,
        birth_year: account.profile?.birthYear ?? null,
        administrative_area_code: account.profile?.administrativeAreaCode ?? null,
      },
      consents: consents.map((c) => ({
        id: c.id,
        purpose_code: c.consentPurpose.code,
        version: c.consentPurpose.version,
        status: c.status,
        granted_at: c.grantedAt ? c.grantedAt.toISOString() : null,
        withdrawn_at: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
      })),
      health_inputs: healthInputs.map((h) => ({
        id: h.id,
        category: h.category,
        field_code: h.fieldCode,
        numeric_value: h.numericValue,
        text_value: h.textValue,
        unit: h.unit,
        observed_at: h.observedAt.toISOString(),
        source_type: h.sourceType,
        status: h.status,
      })),
      risk_assessments: assessments.map((a) => ({
        id: a.id,
        use_case: a.riskUseCase.code,
        rule_model_version: a.ruleModelVersion.version,
        status: a.status,
        level: a.level,
        calculated_at: a.calculatedAt ? a.calculatedAt.toISOString() : null,
        limitations: a.limitations,
      })),
      notification_preferences: account.notificationPreference
        ? {
            in_app_enabled: account.notificationPreference.inAppEnabled,
            email_enabled: account.notificationPreference.emailEnabled,
            sms_enabled: account.notificationPreference.smsEnabled,
            push_enabled: account.notificationPreference.pushEnabled,
            enabled_categories: account.notificationPreference.enabledCategories,
          }
        : null,
    };
  }

  private buildExportCursorFilter(cursor?: string): Prisma.DataExportRequestWhereInput | undefined {
    if (!cursor) {
      return undefined;
    }
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) {
      return undefined;
    }
    return {
      OR: [
        { requestedAt: { lt: sortDate } },
        {
          requestedAt: sortDate,
          id: { lt: decoded.id },
        },
      ],
    };
  }

  private toDataExportView(row: DataExportRequest, summary?: PortableDataSummary): DataExportView {
    return {
      id: row.id,
      user_account_id: row.userAccountId,
      status: row.status,
      requested_at: row.requestedAt.toISOString(),
      completed_at: row.completedAt ? row.completedAt.toISOString() : null,
      expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
      ...(summary ? { summary } : {}),
    };
  }
}
