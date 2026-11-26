import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RequireRoles } from '@common/decorators/require-roles.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import {
  GetEnvironmentContextQueryDto,
  TriggerEnvironmentIngestionDto,
} from './dto/environment.dto';
import { EnvironmentService } from './environment.service';

@Controller()
export class EnvironmentController {
  constructor(private readonly environmentService: EnvironmentService) {}

  @Get('environment')
  async getEnvironmentContext(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: GetEnvironmentContextQueryDto,
  ) {
    return this.environmentService.getEnvironmentalContext(principal, query);
  }

  @Post('admin/environment/ingest')
  @RequireRoles(RoleCode.platform_admin)
  @Idempotent('environment.ingest')
  async triggerAdminIngestion(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: TriggerEnvironmentIngestionDto,
  ) {
    return this.environmentService.ingestAreaObservations(dto.area_code, {
      actorId: principal.userAccountId,
    });
  }
}
