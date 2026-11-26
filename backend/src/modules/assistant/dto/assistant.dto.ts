import { IsDefined, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateAssistantConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/)
  topic_category?: string;
}

export class SendAssistantMessageDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}
