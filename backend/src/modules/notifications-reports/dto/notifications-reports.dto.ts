import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ALLOWED_NOTIFICATION_CATEGORIES = [
  'preventive_checkin_reminder',
  'risk_indicator_update',
  'report_ready',
  'referral_status_update',
  'consultation_status_update',
] as const;

export const ALLOWED_REPORT_CATEGORIES = [
  'health_inputs',
  'risk_assessments',
  'environmental_context',
  'provider_follow_ups',
] as const;

const HH_MM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  email_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sms_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_]+$/, { each: true })
  enabled_categories?: string[];

  @IsOptional()
  @IsString()
  @Matches(HH_MM_REGEX)
  quiet_hours_start?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HH_MM_REGEX)
  quiet_hours_end?: string | null;
}

export class GetTrendsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  period_days?: number;
}

export class RequestReportDto {
  @IsDefined()
  @IsISO8601()
  period_start!: string;

  @IsDefined()
  @IsISO8601()
  period_end!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_]+$/, { each: true })
  included_categories?: string[];

  @IsOptional()
  @IsBoolean()
  defer_generation?: boolean;
}

export class GrantReportAccessDto {
  @IsDefined()
  @IsUUID()
  granted_to_user_id!: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  purpose!: string;

  @IsDefined()
  @IsISO8601()
  expires_at!: string;
}
