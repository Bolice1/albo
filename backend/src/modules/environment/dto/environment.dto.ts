import { IsDefined, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { APPROVED_RWANDA_AREA_CODES } from '@integrations/weather/weather.adapter';

export class GetEnvironmentContextQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z0-9-]+$/)
  area_code?: string;
}

export class TriggerEnvironmentIngestionDto {
  @IsDefined()
  @IsString()
  @IsIn(APPROVED_RWANDA_AREA_CODES)
  area_code!: string;
}
