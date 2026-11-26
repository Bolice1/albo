import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ActorType,
  AssignmentStatus,
  AuditOutcome,
  ClinicalReviewStatus,
  IdentitySubjectStatus,
  ImplementationType,
  MembershipStatus,
  Organization,
  OrganizationMembership,
  OrganizationStatus,
  Prisma,
  ProviderAssignment,
  RoleCode,
} from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  ConflictDomainException,
  ForbiddenOperationException,
  MalformedRequestException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { PrismaService } from '@database/prisma.service';
import { AuditEventView, AuditService } from '@modules/audit/audit.service';
import { ConsentPurposeView, ConsentService } from '@modules/consent/consent.service';
import {
  AuditEventsQueryDto,
  CreateOrganizationDto,
  CreateOrganizationMembershipDto,
  CreateProviderAssignmentDto,
  GrantRoleDto,
  UpdateAccountStatusDto,
  UpdateProviderAssignmentDto,
} from './dto/admin.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROHIBITED_WILDCARD_SCOPES = new Set(['*', 'all', 'full_access', 'unrestricted']);

const SELF_GRANT_PROHIBITED_ROLES: ReadonlySet<RoleCode> = new Set([
  RoleCode.provider,
  RoleCode.community_health_worker,
  RoleCode.facility_user,
]);

export interface AdminAccountView {
  id: string;
  account_status: AccountStatus;
  preferred_language: string;
  timezone: string;
  roles: RoleCode[];
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationView {
  id: string;
  name: string;
  organization_type: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembershipView {
  id: string;
  organization_id: string;
  user_account_id: string;
  role_code: RoleCode;
  status: MembershipStatus;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface ProviderAssignmentView {
  id: string;
  provider_user_id: string;
  citizen_user_id: string;
  organization_id: string;
  allowed_scopes: string[];
  status: AssignmentStatus;
  starts_at: string;
  ends_at: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface RuleVersionGovernanceView {
  id: string;
  use_case_code: string;
  use_case_status: string;
  version: string;
  implementation_type: ImplementationType;
  approval_status: ClinicalReviewStatus;
  effective_from: string | null;
  retired_at: string | null;
  limitations: string[];
  created_at: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly consentService: ConsentService,
  ) {}

  async listAccounts(
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<AdminAccountView>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
    const cursorFilter = this.buildAccountCursorFilter(pagination.cursor);

    const rows = await this.prisma.userAccount.findMany({
      where: cursorFilter ? { AND: [cursorFilter] } : undefined,
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      account_status: row.accountStatus,
      preferred_language: row.preferredLanguage,
      timezone: row.timezone,
      roles: row.roles.map((r) => r.role.code),
      onboarding_completed_at: row.onboardingCompletedAt
        ? row.onboardingCompletedAt.toISOString()
        : null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    }));

    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async updateAccountStatus(
    principal: AuthenticatedPrincipal,
    accountId: string,
    dto: UpdateAccountStatusDto,
  ): Promise<AdminAccountView> {
    if (!UUID_REGEX.test(accountId)) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    if (accountId === principal.userAccountId && dto.account_status === AccountStatus.suspended) {
      throw new ConflictDomainException('Administrators cannot suspend their own active account.');
    }

    const target = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          where: { revokedAt: null },
          include: { role: true },
        },
      },
    });

    if (!target) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    const now = new Date();
    const subjectStatus =
      dto.account_status === AccountStatus.suspended
        ? IdentitySubjectStatus.suspended
        : IdentitySubjectStatus.active;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.userAccount.update({
        where: { id: accountId },
        data: {
          accountStatus: dto.account_status,
        },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      });

      await tx.identitySubject.update({
        where: { id: target.identitySubjectId },
        data: { status: subjectStatus },
      });

      if (dto.account_status === AccountStatus.suspended) {
        await tx.providerAssignment.updateMany({
          where: {
            OR: [{ providerUserId: accountId }, { citizenUserId: accountId }],
            status: AssignmentStatus.active,
          },
          data: {
            status: AssignmentStatus.revoked,
            endsAt: now,
          },
        });
      }

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.account_status_updated',
          resourceType: 'user_account',
          resourceId: accountId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            previous_status: target.accountStatus,
            new_status: dto.account_status,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        account_status: updated.accountStatus,
        preferred_language: updated.preferredLanguage,
        timezone: updated.timezone,
        roles: updated.roles.map((r) => r.role.code),
        onboarding_completed_at: updated.onboardingCompletedAt
          ? updated.onboardingCompletedAt.toISOString()
          : null,
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
      };
    });
  }

  async grantRole(
    principal: AuthenticatedPrincipal,
    accountId: string,
    dto: GrantRoleDto,
  ): Promise<AdminAccountView> {
    if (!UUID_REGEX.test(accountId)) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    // Separation of duties (ACCESS_CONTROL.md §9):
    // Administrators cannot grant themselves provider, CHW, or facility clinical roles.
    if (accountId === principal.userAccountId && SELF_GRANT_PROHIBITED_ROLES.has(dto.role_code)) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'admin.role_grant',
        resourceType: 'user_account',
        resourceId: accountId,
        outcome: AuditOutcome.denied,
        metadata: {
          attempted_role: dto.role_code,
          reason: 'separation_of_duties_self_grant_prohibited',
        },
      });
      throw new ForbiddenOperationException(
        'Separation of duties prohibits administrators from granting provider or community-health roles to themselves.',
      );
    }

    const targetAccount = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
    });
    if (!targetAccount) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { code: dto.role_code },
        update: {},
        create: {
          code: dto.role_code,
          description: `Albo ${dto.role_code} role`,
        },
      });

      const existingActive = await tx.userRole.findFirst({
        where: {
          userAccountId: accountId,
          roleId: role.id,
          revokedAt: null,
        },
      });

      if (!existingActive) {
        await tx.userRole.create({
          data: {
            userAccountId: accountId,
            roleId: role.id,
            grantedById: principal.userAccountId,
          },
        });
      }

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.role_grant',
          resourceType: 'user_account',
          resourceId: accountId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            role_code: dto.role_code,
            idempotent_noop: Boolean(existingActive),
          },
        },
        tx,
      );

      const refreshed = await tx.userAccount.findUniqueOrThrow({
        where: { id: accountId },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      });

      return {
        id: refreshed.id,
        account_status: refreshed.accountStatus,
        preferred_language: refreshed.preferredLanguage,
        timezone: refreshed.timezone,
        roles: refreshed.roles.map((r) => r.role.code),
        onboarding_completed_at: refreshed.onboardingCompletedAt
          ? refreshed.onboardingCompletedAt.toISOString()
          : null,
        created_at: refreshed.createdAt.toISOString(),
        updated_at: refreshed.updatedAt.toISOString(),
      };
    });
  }

  async revokeRole(
    principal: AuthenticatedPrincipal,
    accountId: string,
    roleCodeParam: string,
  ): Promise<AdminAccountView> {
    if (!UUID_REGEX.test(accountId)) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    const validRoleCodes = Object.values(RoleCode) as string[];
    if (!validRoleCodes.includes(roleCodeParam)) {
      throw new MalformedRequestException('Invalid role code parameter.', [
        { field: 'roleCode', reason: 'invalid_role_code' },
      ]);
    }
    const roleCode = roleCodeParam as RoleCode;

    if (accountId === principal.userAccountId && roleCode === RoleCode.platform_admin) {
      throw new ConflictDomainException(
        'Administrators cannot revoke their own platform_admin role.',
      );
    }

    const targetAccount = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
    });
    if (!targetAccount) {
      throw new ResourceNotFoundException('Target account was not found.');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { code: roleCode } });
      if (role) {
        await tx.userRole.updateMany({
          where: {
            userAccountId: accountId,
            roleId: role.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });
      }

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.role_revoke',
          resourceType: 'user_account',
          resourceId: accountId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            role_code: roleCode,
          },
        },
        tx,
      );

      const refreshed = await tx.userAccount.findUniqueOrThrow({
        where: { id: accountId },
        include: {
          roles: {
            where: { revokedAt: null },
            include: { role: true },
          },
        },
      });

      return {
        id: refreshed.id,
        account_status: refreshed.accountStatus,
        preferred_language: refreshed.preferredLanguage,
        timezone: refreshed.timezone,
        roles: refreshed.roles.map((r) => r.role.code),
        onboarding_completed_at: refreshed.onboardingCompletedAt
          ? refreshed.onboardingCompletedAt.toISOString()
          : null,
        created_at: refreshed.createdAt.toISOString(),
        updated_at: refreshed.updatedAt.toISOString(),
      };
    });
  }

  async createOrganization(
    principal: AuthenticatedPrincipal,
    dto: CreateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          organizationType: dto.organization_type,
          status: dto.status ?? OrganizationStatus.active,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.organization_created',
          resourceType: 'organization',
          resourceId: created.id,
          organizationId: created.id,
          outcome: AuditOutcome.succeeded,
          metadata: {
            organization_type: created.organizationType,
            status: created.status,
          },
        },
        tx,
      );

      return this.toOrganizationView(created);
    });
  }

  async listOrganizations(
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<OrganizationView>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
    const cursorFilter = this.buildOrganizationCursorFilter(pagination.cursor);

    const rows = await this.prisma.organization.findMany({
      where: cursorFilter ? { AND: [cursorFilter] } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((r) => this.toOrganizationView(r));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async createOrganizationMembership(
    principal: AuthenticatedPrincipal,
    orgId: string,
    dto: CreateOrganizationMembershipDto,
  ): Promise<OrganizationMembershipView> {
    if (!UUID_REGEX.test(orgId)) {
      throw new ResourceNotFoundException('Organization was not found.');
    }

    if (
      dto.user_account_id === principal.userAccountId &&
      SELF_GRANT_PROHIBITED_ROLES.has(dto.role_code)
    ) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'admin.organization_membership_created',
        resourceType: 'organization_membership',
        organizationId: orgId,
        outcome: AuditOutcome.denied,
        metadata: {
          attempted_role: dto.role_code,
          reason: 'separation_of_duties_self_membership_prohibited',
        },
      });
      throw new ForbiddenOperationException(
        'Separation of duties prohibits administrators from adding themselves in clinical or facility roles.',
      );
    }

    const [org, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.userAccount.findUnique({ where: { id: dto.user_account_id } }),
    ]);

    if (!org) {
      throw new ResourceNotFoundException('Organization was not found.');
    }
    if (!user) {
      throw new ResourceNotFoundException('Target user account was not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userAccountId: dto.user_account_id,
          roleCode: dto.role_code,
          status: MembershipStatus.active,
        },
      });

      const membership =
        existingActive ??
        (await tx.organizationMembership.create({
          data: {
            organizationId: orgId,
            userAccountId: dto.user_account_id,
            roleCode: dto.role_code,
            status: MembershipStatus.active,
          },
        }));

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.organization_membership_created',
          resourceType: 'organization_membership',
          resourceId: membership.id,
          organizationId: orgId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            member_user_id: dto.user_account_id,
            role_code: dto.role_code,
            idempotent_noop: Boolean(existingActive),
          },
        },
        tx,
      );

      return this.toMembershipView(membership);
    });
  }

  async createProviderAssignment(
    principal: AuthenticatedPrincipal,
    dto: CreateProviderAssignmentDto,
  ): Promise<ProviderAssignmentView> {
    this.validateAllowedScopes(dto.allowed_scopes);

    if (dto.provider_user_id === principal.userAccountId) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'admin.provider_assignment_created',
        resourceType: 'provider_assignment',
        organizationId: dto.organization_id,
        outcome: AuditOutcome.denied,
        metadata: {
          reason: 'separation_of_duties_self_assignment_prohibited',
        },
      });
      throw new ForbiddenOperationException(
        'Separation of duties prohibits administrators from creating provider assignments for themselves.',
      );
    }

    if (dto.provider_user_id === dto.citizen_user_id) {
      throw new ValidationDomainException('Provider and citizen accounts must be distinct.', [
        { field: 'citizen_user_id', reason: 'must_differ_from_provider' },
      ]);
    }

    const startsAt = dto.starts_at ? new Date(dto.starts_at) : new Date();
    const endsAt = dto.ends_at ? new Date(dto.ends_at) : null;
    if (endsAt && endsAt <= startsAt) {
      throw new ValidationDomainException(
        'Assignment end timestamp must be after start timestamp.',
        [{ field: 'ends_at', reason: 'must_be_after_starts_at' }],
      );
    }

    const [org, providerAccount, citizenAccount] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: dto.organization_id },
      }),
      this.prisma.userAccount.findUnique({
        where: { id: dto.provider_user_id },
        include: {
          roles: { where: { revokedAt: null }, include: { role: true } },
          organizationMemberships: {
            where: {
              organizationId: dto.organization_id,
              status: MembershipStatus.active,
            },
          },
        },
      }),
      this.prisma.userAccount.findUnique({
        where: { id: dto.citizen_user_id },
      }),
    ]);

    if (!org || org.status !== OrganizationStatus.active) {
      throw new ResourceNotFoundException('Active organization was not found.');
    }
    if (!providerAccount || providerAccount.accountStatus !== AccountStatus.active) {
      throw new ResourceNotFoundException('Active provider user account was not found.');
    }
    if (!citizenAccount || citizenAccount.accountStatus !== AccountStatus.active) {
      throw new ResourceNotFoundException('Active citizen user account was not found.');
    }

    const providerRoles = providerAccount.roles.map((r) => r.role.code);
    const hasClinicalOrChwRole =
      providerRoles.includes(RoleCode.provider) ||
      providerRoles.includes(RoleCode.community_health_worker);
    if (!hasClinicalOrChwRole) {
      throw new ValidationDomainException(
        'Assigned user must hold provider or community_health_worker role.',
        [{ field: 'provider_user_id', reason: 'missing_provider_or_chw_role' }],
      );
    }

    if (providerAccount.organizationMemberships.length === 0) {
      throw new ValidationDomainException(
        'Assigned provider must have an active membership in the specified organization.',
        [
          {
            field: 'organization_id',
            reason: 'provider_not_member_of_organization',
          },
        ],
      );
    }

    const uniqueScopes = Array.from(new Set(dto.allowed_scopes));

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.providerAssignment.create({
        data: {
          providerUserId: dto.provider_user_id,
          citizenUserId: dto.citizen_user_id,
          organizationId: dto.organization_id,
          allowedScopes: uniqueScopes,
          status: AssignmentStatus.active,
          startsAt,
          endsAt,
          createdById: principal.userAccountId,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.provider_assignment_created',
          resourceType: 'provider_assignment',
          resourceId: created.id,
          organizationId: created.organizationId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            provider_user_id: created.providerUserId,
            citizen_user_id: created.citizenUserId,
            allowed_scopes: created.allowedScopes,
          },
        },
        tx,
      );

      return this.toAssignmentView(created);
    });
  }

  async updateProviderAssignment(
    principal: AuthenticatedPrincipal,
    assignmentId: string,
    dto: UpdateProviderAssignmentDto,
  ): Promise<ProviderAssignmentView> {
    if (!UUID_REGEX.test(assignmentId)) {
      throw new ResourceNotFoundException('Provider assignment was not found.');
    }

    if (dto.allowed_scopes !== undefined) {
      this.validateAllowedScopes(dto.allowed_scopes);
    }

    const existing = await this.prisma.providerAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) {
      throw new ResourceNotFoundException('Provider assignment was not found.');
    }

    const endsAt =
      dto.ends_at === undefined
        ? existing.endsAt
        : dto.ends_at === null
          ? null
          : new Date(dto.ends_at);

    if (endsAt && endsAt <= existing.startsAt) {
      throw new ValidationDomainException(
        'Assignment end timestamp must be after start timestamp.',
        [{ field: 'ends_at', reason: 'must_be_after_starts_at' }],
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerAssignment.update({
        where: { id: assignmentId },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.allowed_scopes !== undefined
            ? { allowedScopes: Array.from(new Set(dto.allowed_scopes)) }
            : {}),
          ...(dto.ends_at !== undefined ? { endsAt } : {}),
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'admin.provider_assignment_updated',
          resourceType: 'provider_assignment',
          resourceId: updated.id,
          organizationId: updated.organizationId,
          outcome: AuditOutcome.succeeded,
          metadata: {
            status: updated.status,
            allowed_scopes: updated.allowedScopes,
          },
        },
        tx,
      );

      return this.toAssignmentView(updated);
    });
  }

  async listConsentPurposes(): Promise<ConsentPurposeView[]> {
    return this.consentService.listAllPurposesForAdmin();
  }

  async listRuleVersions(): Promise<RuleVersionGovernanceView[]> {
    const rows = await this.prisma.ruleModelVersion.findMany({
      include: { riskUseCase: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      use_case_code: row.riskUseCase.code,
      use_case_status: row.riskUseCase.status,
      version: row.version,
      implementation_type: row.implementationType,
      approval_status: row.approvalStatus,
      effective_from: row.effectiveFrom ? row.effectiveFrom.toISOString() : null,
      retired_at: row.retiredAt ? row.retiredAt.toISOString() : null,
      limitations: row.limitations,
      created_at: row.createdAt.toISOString(),
    }));
  }

  async listAuditEvents(
    principal: AuthenticatedPrincipal,
    query: AuditEventsQueryDto,
  ): Promise<PaginatedResult<AuditEventView>> {
    // Audit-log reads are themselves audited per ACCESS_CONTROL.md §14
    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'admin.audit_events.read',
      resourceType: 'audit_event',
      outcome: AuditOutcome.allowed,
      metadata: {
        filters_applied: {
          has_actor_id: Boolean(query.actor_id),
          resource_type: query.resource_type ?? null,
          action: query.action ?? null,
          outcome: query.outcome ?? null,
        },
      },
    });

    return this.auditService.listEvents({
      actorId: query.actor_id,
      resourceType: query.resource_type,
      action: query.action,
      outcome: query.outcome,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  private validateAllowedScopes(scopes: string[]): void {
    for (const scope of scopes) {
      if (PROHIBITED_WILDCARD_SCOPES.has(scope.trim().toLowerCase())) {
        throw new ValidationDomainException(
          'Unrestricted or wildcard assignment scopes are prohibited.',
          [{ field: 'allowed_scopes', reason: 'wildcard_scope_prohibited' }],
        );
      }
    }
  }

  private buildAccountCursorFilter(cursor?: string): Prisma.UserAccountWhereInput | undefined {
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
        { createdAt: { lt: sortDate } },
        {
          createdAt: sortDate,
          id: { lt: decoded.id },
        },
      ],
    };
  }

  private buildOrganizationCursorFilter(
    cursor?: string,
  ): Prisma.OrganizationWhereInput | undefined {
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
        { createdAt: { lt: sortDate } },
        {
          createdAt: sortDate,
          id: { lt: decoded.id },
        },
      ],
    };
  }

  private toOrganizationView(org: Organization): OrganizationView {
    return {
      id: org.id,
      name: org.name,
      organization_type: org.organizationType,
      status: org.status,
      created_at: org.createdAt.toISOString(),
      updated_at: org.updatedAt.toISOString(),
    };
  }

  private toMembershipView(m: OrganizationMembership): OrganizationMembershipView {
    return {
      id: m.id,
      organization_id: m.organizationId,
      user_account_id: m.userAccountId,
      role_code: m.roleCode,
      status: m.status,
      started_at: m.startedAt.toISOString(),
      ended_at: m.endedAt ? m.endedAt.toISOString() : null,
      created_at: m.createdAt.toISOString(),
    };
  }

  private toAssignmentView(a: ProviderAssignment): ProviderAssignmentView {
    return {
      id: a.id,
      provider_user_id: a.providerUserId,
      citizen_user_id: a.citizenUserId,
      organization_id: a.organizationId,
      allowed_scopes: a.allowedScopes,
      status: a.status,
      starts_at: a.startsAt.toISOString(),
      ends_at: a.endsAt ? a.endsAt.toISOString() : null,
      created_by_id: a.createdById,
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    };
  }
}
