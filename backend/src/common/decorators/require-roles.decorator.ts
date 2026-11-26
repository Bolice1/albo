import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@prisma/client';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export const RequireRoles = (...roles: RoleCode[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
