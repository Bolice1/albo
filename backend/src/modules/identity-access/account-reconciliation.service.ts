import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ActorType,
  AuditOutcome,
  IdentitySubjectStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { ForbiddenOperationException } from '@common/errors/app.exception';
import { PrismaService } from '@database/prisma.service';
import { VerifiedJwtIdentity } from '@integrations/identity/oidc-jwt-verifier.service';
import { AuditService } from '@modules/audit/audit.service';

@Injectable()
export class AccountReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async resolvePrincipal(verified: VerifiedJwtIdentity): Promise<AuthenticatedPrincipal> {
    const provider = verified.issuer;
    const externalSubjectId = verified.externalSubjectId;

    let subject = await this.findSubjectWithAccount(provider, externalSubjectId);
    if (!subject || !subject.userAccount) {
      subject = await this.provisionFirstSignIn(provider, externalSubjectId);
    }

    const account = subject.userAccount;
    if (!account) {
      throw new ForbiddenOperationException('User account is unavailable.');
    }

    if (
      subject.status !== IdentitySubjectStatus.active ||
      account.accountStatus !== AccountStatus.active
    ) {
      await this.auditService.record({
        actorId: account.id,
        actorType: ActorType.user,
        action: 'auth.session_check',
        resourceType: 'user_account',
        resourceId: account.id,
        outcome: AuditOutcome.denied,
        metadata: {
          account_status: account.accountStatus,
          reason: 'inactive_account',
        },
      });
      throw new ForbiddenOperationException('This account is suspended or pending deletion.');
    }

    await this.prisma.identitySubject.update({
      where: { id: subject.id },
      data: { lastSeenAt: new Date() },
    });

    const activeRoles = account.roles
      .filter((ur) => ur.revokedAt === null)
      .map((ur) => ur.role.code);

    return {
      userAccountId: account.id,
      identitySubjectId: subject.id,
      externalSubjectId: subject.externalSubjectId,
      accountStatus: account.accountStatus,
      roles: Array.from(new Set(activeRoles)),
    };
  }

  private async findSubjectWithAccount(provider: string, externalSubjectId: string) {
    return this.prisma.identitySubject.findUnique({
      where: {
        provider_externalSubjectId: {
          provider,
          externalSubjectId,
        },
      },
      include: {
        userAccount: {
          include: {
            roles: {
              where: { revokedAt: null },
              include: { role: true },
            },
          },
        },
      },
    });
  }

  private async provisionFirstSignIn(provider: string, externalSubjectId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const citizenRole = await tx.role.upsert({
          where: { code: RoleCode.citizen },
          update: {},
          create: {
            code: RoleCode.citizen,
            description:
              'Adult citizen managing personal preventive-health profile, consents, and indicators',
          },
        });

        const now = new Date();
        const createdSubject = await tx.identitySubject.create({
          data: {
            provider,
            externalSubjectId,
            status: IdentitySubjectStatus.active,
            lastSeenAt: now,
            userAccount: {
              create: {
                accountStatus: AccountStatus.active,
                preferredLanguage: 'en',
                timezone: 'Africa/Kigali',
                profile: {
                  create: {},
                },
                notificationPreference: {
                  create: {
                    inAppEnabled: true,
                    emailEnabled: false,
                    smsEnabled: false,
                    pushEnabled: false,
                    enabledCategories: [],
                  },
                },
                roles: {
                  create: {
                    roleId: citizenRole.id,
                  },
                },
              },
            },
          },
          include: {
            userAccount: {
              include: {
                roles: {
                  where: { revokedAt: null },
                  include: { role: true },
                },
              },
            },
          },
        });

        if (createdSubject.userAccount) {
          await this.auditService.record(
            {
              actorId: createdSubject.userAccount.id,
              actorType: ActorType.user,
              action: 'account.provisioned',
              resourceType: 'user_account',
              resourceId: createdSubject.userAccount.id,
              outcome: AuditOutcome.succeeded,
              metadata: {
                default_role: RoleCode.citizen,
              },
            },
            tx,
          );
        }

        return createdSubject;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findSubjectWithAccount(provider, externalSubjectId);
        if (raced) {
          return raced;
        }
      }
      throw err;
    }
  }
}
