import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import {
  CreateCheckInDto,
  CreateHealthInputDto,
  ListHealthInputsQueryDto,
  SupersedeHealthInputDto,
} from './dto/health-profile.dto';
import { HealthProfileService } from './health-profile.service';

@Controller('me')
export class MeHealthProfileController {
  constructor(private readonly healthProfileService: HealthProfileService) {}

  @Get('health-inputs')
  async listHealthInputs(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListHealthInputsQueryDto,
  ) {
    return this.healthProfileService.listHealthInputs(principal, query);
  }

  @Get('health-inputs/:inputId')
  async getHealthInputById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('inputId') inputId: string,
  ) {
    return this.healthProfileService.getHealthInputById(principal, inputId);
  }

  @Post('health-inputs')
  @Idempotent('health_input.create')
  @RateLimit({ category: 'health_input_write', limit: 60, windowSeconds: 60 })
  async createHealthInput(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateHealthInputDto,
  ) {
    return this.healthProfileService.createHealthInput(principal, dto);
  }

  @Patch('health-inputs/:inputId')
  @RateLimit({ category: 'health_input_write', limit: 60, windowSeconds: 60 })
  async supersedeHealthInput(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('inputId') inputId: string,
    @Body() dto: SupersedeHealthInputDto,
  ) {
    return this.healthProfileService.supersedeHealthInput(principal, inputId, dto);
  }

  @Get('check-ins')
  async listCheckIns(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ) {
    return this.healthProfileService.listCheckIns(principal, pagination);
  }

  @Post('check-ins')
  @Idempotent('checkin.create')
  @RateLimit({ category: 'checkin_write', limit: 20, windowSeconds: 60 })
  async createCheckIn(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.healthProfileService.createCheckIn(principal, dto);
  }
}
