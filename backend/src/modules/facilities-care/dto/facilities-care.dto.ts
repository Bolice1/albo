import { ConsultationStatus, FacilityType, ReferralType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import type { TravelMode } from '@integrations/maps/directions.adapter';

export class SearchFacilitiesQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  area_code?: string;

  @IsOptional()
  @IsEnum(FacilityType)
  facility_type?: FacilityType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/i)
  service_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(100)
  radius_km?: number;
}

export class GetFacilityDetailQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  from_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  from_lng?: number;

  @IsOptional()
  @IsIn(['driving', 'walking'])
  travel_mode?: TravelMode;
}

export class SearchProvidersQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/i)
  specialty_tag?: string;

  @IsOptional()
  @IsUUID()
  organization_id?: string;
}

export class CreateReferralDto {
  @IsOptional()
  @IsUUID()
  citizen_user_id?: string;

  @IsOptional()
  @IsUUID()
  facility_id?: string;

  @IsOptional()
  @IsUUID()
  provider_user_id?: string;

  @IsEnum(ReferralType)
  type!: ReferralType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  purpose!: string;

  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes_summary?: string;
}

export class CreateConsultationDto {
  @IsOptional()
  @IsUUID()
  citizen_user_id?: string;

  @IsOptional()
  @IsUUID()
  provider_user_id?: string;

  @IsOptional()
  @IsUUID()
  organization_id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  purpose!: string;

  @IsOptional()
  @IsISO8601()
  requested_for_at?: string;

  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;
}

export class UpdateConsultationStatusDto {
  @IsIn([
    ConsultationStatus.requested,
    ConsultationStatus.scheduled,
    ConsultationStatus.completed,
    ConsultationStatus.cancelled,
  ])
  status!: ConsultationStatus;

  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;
}

export class CreateProviderFollowUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]{2,63}$/)
  action_type!: string;

  @IsObject()
  structured_notes!: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  referenced_assessment_id?: string;

  @IsOptional()
  @IsISO8601()
  recommended_follow_up_at?: string;
}
