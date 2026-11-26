import {
  AccountStatus,
  AssignmentStatus,
  AuditOutcome,
  OrganizationStatus,
  RoleCode,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';

export class UpdateAccountStatusDto {
  @IsIn([AccountStatus.active, AccountStatus.suspended])
  account_status!: 'active' | 'suspended';
}

export class GrantRoleDto {
  @IsEnum(RoleCode)
  role_code!: RoleCode;
}

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/)
  organization_type!: string;

  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}

export class CreateOrganizationMembershipDto {
  @IsUUID()
  user_account_id!: string;

  @IsEnum(RoleCode)
  role_code!: RoleCode;
}

export class CreateProviderAssignmentDto {
  @IsUUID()
  provider_user_id!: string;

  @IsUUID()
  citizen_user_id!: string;

  @IsUUID()
  organization_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @Matches(/^[a-z0-9][a-z0-9_:.-]{2,63}$/, { each: true })
  allowed_scopes!: string[];

  @IsOptional()
  @IsISO8601()
  starts_at?: string;

  @IsOptional()
  @IsISO8601()
  ends_at?: string;
}

export class UpdateProviderAssignmentDto {
  @IsOptional()
  @IsIn([
    AssignmentStatus.active,
    AssignmentStatus.ended,
    AssignmentStatus.expired,
    AssignmentStatus.revoked,
  ])
  status?: AssignmentStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @Matches(/^[a-z0-9][a-z0-9_:.-]{2,63}$/, { each: true })
  allowed_scopes?: string[];

  @IsOptional()
  @IsISO8601()
  ends_at?: string | null;
}

export class AuditEventsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  actor_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;
}
