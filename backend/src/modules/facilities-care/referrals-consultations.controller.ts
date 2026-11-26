import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import {
  CreateConsultationDto,
  CreateReferralDto,
  UpdateConsultationStatusDto,
} from './dto/facilities-care.dto';
import { FacilitiesCareService } from './facilities-care.service';

@Controller()
export class ReferralsConsultationsController {
  constructor(private readonly facilitiesCareService: FacilitiesCareService) {}

  @Post('referrals')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent('referral.create')
  @RateLimit({ category: 'referral_create', limit: 15, windowSeconds: 60 })
  async createReferral(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateReferralDto,
  ) {
    return this.facilitiesCareService.createReferral(principal, dto);
  }

  @Get('referrals')
  async listReferrals(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listReferrals(principal, query);
  }

  @Get('referrals/:referralId')
  async getReferralById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('referralId') referralId: string,
  ) {
    return this.facilitiesCareService.getReferralById(principal, referralId);
  }

  @Post('consultations')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent('consultation.create')
  @RateLimit({ category: 'consultation_create', limit: 15, windowSeconds: 60 })
  async createConsultation(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateConsultationDto,
  ) {
    return this.facilitiesCareService.createConsultation(principal, dto);
  }

  @Get('consultations')
  async listConsultations(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.facilitiesCareService.listConsultations(principal, query);
  }

  @Get('consultations/:consultationId')
  async getConsultationById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('consultationId') consultationId: string,
  ) {
    return this.facilitiesCareService.getConsultationById(principal, consultationId);
  }

  @Patch('consultations/:consultationId')
  async updateConsultationStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('consultationId') consultationId: string,
    @Body() dto: UpdateConsultationStatusDto,
  ) {
    return this.facilitiesCareService.updateConsultationStatus(principal, consultationId, dto);
  }
}
