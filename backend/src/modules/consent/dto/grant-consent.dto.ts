import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GrantConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/)
  purpose_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  version?: string;
}
