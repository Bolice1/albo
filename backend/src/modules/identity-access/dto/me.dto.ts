import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const SUPPORTED_LANGUAGES = ['en', 'rw', 'fr'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string | null;

  @IsOptional()
  @IsInt()
  birth_year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  administrative_area_code?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES)
  preferred_language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9/_+-]+$/)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  mark_onboarding_completed?: boolean;
}

export class CreateAccountDeletionRequestDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
