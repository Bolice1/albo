import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import { CreateProviderFollowUpDto } from './dto/facilities-care.dto';
import { FacilitiesCareService } from './facilities-care.service';

@Controller('provider')
export class ProviderPortalController {
  constructor(private readonly facilitiesCareService: FacilitiesCareService) {}

  @Get('assigned-citizens')
  async listAssignedCitizens(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listAssignedCitizens(principal, query);
  }

  @Get('citizens/:citizenId/overview')
  async getCitizenOverview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('citizenId') citizenId: string,
  ) {
    return this.facilitiesCareService.getCitizenOverviewForProvider(principal, citizenId);
  }

  @Get('citizens/:citizenId/health-inputs')
  async listCitizenHealthInputs(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('citizenId') citizenId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listCitizenHealthInputsForProvider(
      principal,
      citizenId,
      query,
    );
  }

  @Get('citizens/:citizenId/risk-assessments')
  async listCitizenRiskAssessments(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('citizenId') citizenId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listCitizenRiskAssessmentsForProvider(
      principal,
      citizenId,
      query,
    );
  }

  @Post('citizens/:citizenId/follow-ups')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent('provider.followup')
  async createProviderFollowUp(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('citizenId') citizenId: string,
    @Body() dto: CreateProviderFollowUpDto,
  ) {
    return this.facilitiesCareService.createProviderFollowUp(principal, citizenId, dto);
  }

  @Get('citizens/:citizenId/follow-ups')
  async listProviderFollowUps(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('citizenId') citizenId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listProviderFollowUps(principal, citizenId, query);
  }
}
