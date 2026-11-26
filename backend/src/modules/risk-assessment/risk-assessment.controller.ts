import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { RateLimit } from '@common/http/rate-limit.guard';
import { ListRiskAssessmentsQueryDto, RequestRiskAssessmentDto } from './dto/risk-assessment.dto';
import { RiskAssessmentService } from './risk-assessment.service';

@Controller('me/risk-assessments')
export class RiskAssessmentController {
  constructor(private readonly riskAssessmentService: RiskAssessmentService) {}

  @Get()
  async listRiskAssessments(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ListRiskAssessmentsQueryDto,
  ) {
    return this.riskAssessmentService.listRiskAssessments(principal, query);
  }

  @Get(':assessmentId')
  async getRiskAssessmentById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.riskAssessmentService.getRiskAssessmentById(principal, assessmentId);
  }

  @Post()
  @Idempotent('risk_assessment.calculate')
  @RateLimit({ category: 'risk_calculation', limit: 20, windowSeconds: 60 })
  async requestRiskAssessment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: RequestRiskAssessmentDto,
  ) {
    return this.riskAssessmentService.requestRiskAssessment(principal, dto);
  }
}
