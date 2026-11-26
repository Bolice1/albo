import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';

export class RequestRiskAssessmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/)
  use_case_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9._-]+$/i)
  rule_model_version?: string;

  @IsOptional()
  @IsISO8601()
  calculated_for_timestamp?: string;
}

export class ListRiskAssessmentsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/)
  use_case?: string;
}
