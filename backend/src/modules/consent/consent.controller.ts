import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RequireRoles } from '@common/decorators/require-roles.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto, PaginatedResult } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import { ConsentPurposeView, ConsentRecordView, ConsentService } from './consent.service';
import { GrantConsentDto } from './dto/grant-consent.dto';

@Controller('me')
@RequireRoles(RoleCode.citizen)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get('consent-purposes')
  async listPurposes(): Promise<ConsentPurposeView[]> {
    return this.consentService.listPurposes();
  }

  @Get('consents')
  async listMyConsents(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ConsentRecordView>> {
    return this.consentService.listUserConsents(principal.userAccountId, pagination);
  }

  @Post('consents')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent('consent.grant')
  @RateLimit({ category: 'consent_write', limit: 60, windowSeconds: 60 })
  async grantConsent(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: GrantConsentDto,
  ): Promise<ConsentRecordView> {
    return this.consentService.grantConsent(principal, dto);
  }

  @Post('consents/:consentId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ category: 'consent_write', limit: 60, windowSeconds: 60 })
  async withdrawConsent(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('consentId') consentId: string,
  ): Promise<ConsentRecordView> {
    return this.consentService.withdrawConsent(principal, consentId);
  }
}
