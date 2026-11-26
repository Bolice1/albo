import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import { AssistantService } from './assistant.service';
import { CreateAssistantConversationDto, SendAssistantMessageDto } from './dto/assistant.dto';

@Controller('assistant/conversations')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post()
  @Idempotent('assistant.conversation.create')
  @RateLimit({ category: 'assistant_conversation', limit: 20, windowSeconds: 60 })
  async createConversation(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateAssistantConversationDto,
  ) {
    return this.assistantService.createConversation(principal, dto);
  }

  @Get()
  async listConversations(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ) {
    return this.assistantService.listConversations(principal, pagination);
  }

  @Get(':conversationId')
  async getConversationById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('conversationId') conversationId: string,
  ) {
    return this.assistantService.getConversationById(principal, conversationId);
  }

  @Post(':conversationId/messages')
  @Idempotent('assistant.message.send')
  @RateLimit({ category: 'assistant_message', limit: 20, windowSeconds: 60 })
  async sendMessage(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAssistantMessageDto,
  ) {
    return this.assistantService.sendMessage(principal, conversationId, dto);
  }
}
