import { HealthInputCategory, HealthInputStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';

export const ALLOWED_HEALTH_INPUT_STATUS_FILTERS = [
  HealthInputStatus.active,
  HealthInputStatus.corrected,
  HealthInputStatus.superseded,
  HealthInputStatus.retracted,
  'all',
] as const;

export type HealthInputStatusFilter = (typeof ALLOWED_HEALTH_INPUT_STATUS_FILTERS)[number];

export class ListHealthInputsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/)
  field_code?: string;

  @IsOptional()
  @IsEnum(HealthInputCategory)
  category?: HealthInputCategory;

  @IsOptional()
  @IsIn(ALLOWED_HEALTH_INPUT_STATUS_FILTERS)
  status?: HealthInputStatusFilter;
}

export class CreateHealthInputDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  field_code!: string;

  @IsOptional()
  @IsEnum(HealthInputCategory)
  category?: HealthInputCategory;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsNumber()
  numeric_value?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  text_value?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string | null;

  @IsOptional()
  @IsISO8601()
  observed_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:/-]+$/)
  source_reference?: string | null;
}

export class SupersedeHealthInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  field_code?: string;

  @IsOptional()
  @IsEnum(HealthInputCategory)
  category?: HealthInputCategory;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsNumber()
  numeric_value?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  text_value?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string | null;

  @IsOptional()
  @IsISO8601()
  observed_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:/-]+$/)
  source_reference?: string | null;
}

export const APPROVED_QUESTIONNAIRE_VERSIONS = ['wellbeing-v1'] as const;

export class CheckInResponsesDto {
  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(4)
  stress_frequency_score!: number;

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(4)
  exhaustion_score!: number;

  @IsDefined()
  @IsInt()
  @Min(0)
  @Max(4)
  sleep_quality_score!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  self_harm_signal?: number;
}

export class CreateCheckInDto {
  @IsDefined()
  @IsString()
  @IsIn(APPROVED_QUESTIONNAIRE_VERSIONS)
  questionnaire_version!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CheckInResponsesDto)
  responses!: CheckInResponsesDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  free_text_reflection?: string | null;

  @IsOptional()
  @IsISO8601()
  completed_at?: string;
}
