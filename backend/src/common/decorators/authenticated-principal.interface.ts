import { AccountStatus, RoleCode } from '@prisma/client';

export interface AuthenticatedPrincipal {
  userAccountId: string;
  identitySubjectId: string;
  externalSubjectId: string;
  accountStatus: AccountStatus;
  roles: RoleCode[];
}
