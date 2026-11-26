import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ActorType,
  AssignmentStatus,
  AuditOutcome,
  ConsentRecord,
  MembershipStatus,
  OrganizationStatus,
  ProviderAssignment,
  RoleCode,
} from '@prisma/client';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  FeatureDisabledException,
  ForbiddenOperationException,
  ResourceNotFoundException,
} from '@common/errors/app.exception';
import { PrismaService } from '@database/prisma.service';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OwnershipCheckContext {
  resourceType?: string;
  resourceId?: string;
  action?: string;
}

export interface VerifyProviderAccessInput {
  principal: AuthenticatedPrincipal;
  citizenUserId: string;
  requiredScope: string;
  requiredConsentPurpose?: string;
}

export interface VerifiedProviderAccessResult {
  assignment: ProviderAssignment;
  providerSharingConsent: ConsentRecord;
  purposeConsent?: ConsentRecord;
}

@Injectable()
export class AccessPolicyService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Verifies the caller is an active account holding the `citizen` role for self-service routes.
   */
  assertCitizenSelf(principal: AuthenticatedPrincipal): void {
    if (
      principal.accountStatus !== AccountStatus.active ||
      !principal.roles.includes(RoleCode.citizen)
    ) {
      throw new ForbiddenOperationException(
        'Citizen role is required for this self-service operation.',
      );
    }
  }

  /**
   * Enforces strict owner scoping. If `resourceOwnerId !== callerUserId`, writes a denied
   * `audit_event` and throws `ResourceNotFoundException` (`404 NOT_FOUND`) so another
   * person's record existence is never leaked (ADR-004, T-003).
   */
  async assertOwnerOrThrowNotFound(
    resourceOwnerId: string,
    callerUserId: string,
    context?: OwnershipCheckContext,
  ): Promise<void> {
    if (resourceOwnerId === callerUserId) {
      return;
    }

    await this.auditService.record({
      actorId: callerUserId,
      actorType: ActorType.user,
      action: context?.action ?? 'authz.ownership_check',
      resourceType: context?.resourceType ?? 'protected_resource',
      resourceId: context?.resourceId ?? null,
      outcome: AuditOutcome.denied,
      metadata: {
        reason: 'cross_user_access_denied',
      },
    });

    throw new ResourceNotFoundException();
  }

  /**
   * Centralized relationship- and consent-aware provider authorization (ACCESS_CONTROL.md §7, §8, §11):
   * 1. `FEATURE_PROVIDER_PORTAL_ENABLED` must be active (`503 FEATURE_DISABLED` otherwise).
   * 2. Caller must hold `provider` or `community_health_worker` role.
   * 3. Caller must hold an active `OrganizationMembership` in an active `Organization` matching the assignment.
   * 4. `ProviderAssignment` must be `active`, within `startsAt <= now <= endsAt`, and include `requiredScope`.
   * 5. Citizen must have an `active` account and an active `ConsentRecord` for `provider_data_sharing` (`v1`)
   *    (plus `requiredConsentPurpose` if specified).
   *
   * Any failure in steps 2–5 records a denied `audit_event` and throws `404 NOT_FOUND` so citizen existence
   * is never leaked (T-003, T-034, T-044).
   */
  async verifyProviderAccessToCitizen(
    input: VerifyProviderAccessInput,
  ): Promise<VerifiedProviderAccessResult> {
    const {
      principal,
      citizenUserId,
      requiredScope,
      requiredConsentPurpose = 'provider_data_sharing',
    } = input;

    if (!this.config.featureProviderPortalEnabled) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: `provider.access.${requiredScope}`,
        resourceType: 'citizen_record',
        resourceId: UUID_REGEX.test(citizenUserId) ? citizenUserId : null,
        outcome: AuditOutcome.denied,
        purposeCode: 'provider_data_sharing',
        metadata: {
          required_scope: requiredScope,
          reason: 'feature_provider_portal_disabled',
        },
      });
      throw new FeatureDisabledException(
        'Provider portal workflows are currently disabled by platform governance.',
      );
    }

    const holdsAllowedRole =
      principal.roles.includes(RoleCode.provider) ||
      principal.roles.includes(RoleCode.community_health_worker);

    if (!holdsAllowedRole || !UUID_REGEX.test(citizenUserId)) {
      await this.recordProviderDenial(
        principal.userAccountId,
        citizenUserId,
        requiredScope,
        null,
        holdsAllowedRole ? 'invalid_citizen_identifier' : 'missing_provider_role',
      );
      throw new ResourceNotFoundException();
    }

    const now = new Date();
    const candidateAssignments = await this.prisma.providerAssignment.findMany({
      where: {
        providerUserId: principal.userAccountId,
        citizenUserId,
        status: AssignmentStatus.active,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      include: {
        organization: true,
        citizenUser: {
          select: {
            id: true,
            accountStatus: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (candidateAssignments.length === 0) {
      await this.recordProviderDenial(
        principal.userAccountId,
        citizenUserId,
        requiredScope,
        null,
        'no_active_assignment_in_window',
      );
      throw new ResourceNotFoundException();
    }

    let matchedAssignment: (typeof candidateAssignments)[number] | null = null;
    let denialReason = 'scope_or_organization_mismatch';

    for (const candidate of candidateAssignments) {
      if (candidate.citizenUser.accountStatus !== AccountStatus.active) {
        denialReason = 'citizen_account_inactive';
        continue;
      }
      if (candidate.organization.status !== OrganizationStatus.active) {
        denialReason = 'organization_inactive';
        continue;
      }
      if (!candidate.allowedScopes.includes(requiredScope)) {
        denialReason = 'missing_assignment_scope';
        continue;
      }

      const activeMembership = await this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: candidate.organizationId,
          userAccountId: principal.userAccountId,
          status: MembershipStatus.active,
          startedAt: { lte: now },
          OR: [{ endedAt: null }, { endedAt: { gt: now } }],
          roleCode: {
            in: [RoleCode.provider, RoleCode.community_health_worker],
          },
        },
      });

      if (!activeMembership) {
        denialReason = 'missing_active_organization_membership';
        continue;
      }

      matchedAssignment = candidate;
      break;
    }

    if (!matchedAssignment) {
      await this.recordProviderDenial(
        principal.userAccountId,
        citizenUserId,
        requiredScope,
        candidateAssignments[0]?.organizationId ?? null,
        denialReason,
      );
      throw new ResourceNotFoundException();
    }

    const providerSharingConsent = await this.consentService.verifyActiveConsent(
      citizenUserId,
      'provider_data_sharing',
      'v1',
    );

    if (!providerSharingConsent) {
      await this.recordProviderDenial(
        principal.userAccountId,
        citizenUserId,
        requiredScope,
        matchedAssignment.organizationId,
        'missing_provider_data_sharing_consent',
      );
      throw new ResourceNotFoundException();
    }

    let purposeConsent: ConsentRecord | undefined;
    if (requiredConsentPurpose && requiredConsentPurpose !== 'provider_data_sharing') {
      const verifiedPurpose = await this.consentService.verifyActiveConsent(
        citizenUserId,
        requiredConsentPurpose,
        'v1',
      );
      if (!verifiedPurpose) {
        await this.recordProviderDenial(
          principal.userAccountId,
          citizenUserId,
          requiredScope,
          matchedAssignment.organizationId,
          'missing_specific_purpose_consent',
        );
        throw new ResourceNotFoundException();
      }
      purposeConsent = verifiedPurpose;
    }

    return {
      assignment: matchedAssignment,
      providerSharingConsent,
      purposeConsent,
    };
  }

  private async recordProviderDenial(
    actorUserId: string,
    citizenUserId: string,
    requiredScope: string,
    organizationId: string | null,
    reason: string,
  ): Promise<void> {
    await this.auditService.record({
      actorId: actorUserId,
      actorType: ActorType.user,
      action: `provider.access.${requiredScope}`,
      resourceType: 'citizen_record',
      resourceId: UUID_REGEX.test(citizenUserId) ? citizenUserId : null,
      outcome: AuditOutcome.denied,
      organizationId,
      purposeCode: 'provider_data_sharing',
      metadata: {
        required_scope: requiredScope,
        reason,
      },
    });
  }
}
