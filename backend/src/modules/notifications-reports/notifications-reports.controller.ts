import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Idempotent } from '@common/http/idempotency.interceptor';
import { CursorPaginationQueryDto } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import {
  GetTrendsQueryDto,
  GrantReportAccessDto,
  RequestReportDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications-reports.dto';
import { NotificationsReportsService } from './notifications-reports.service';

@Controller('me')
export class NotificationsReportsController {
  constructor(private readonly notificationsReportsService: NotificationsReportsService) {}

  @Get('notification-preferences')
  async getNotificationPreferences(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.notificationsReportsService.getPreferences(principal);
  }

  @Patch('notification-preferences')
  async updateNotificationPreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsReportsService.updatePreferences(principal, dto);
  }

  @Get('notifications')
  async listNotifications(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ) {
    return this.notificationsReportsService.listNotifications(principal, pagination);
  }

  @Post('notifications/:notificationId/read')
  async markNotificationRead(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsReportsService.markNotificationRead(principal, notificationId);
  }

  @Get('trends')
  async getPersonalTrends(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: GetTrendsQueryDto,
  ) {
    return this.notificationsReportsService.getPersonalTrends(principal, query);
  }

  @Get('reports')
  async listReports(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ) {
    return this.notificationsReportsService.listReports(principal, pagination);
  }

  @Post('reports')
  @Idempotent('report.request')
  @RateLimit({ category: 'report_request', limit: 10, windowSeconds: 60 })
  async requestReport(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: RequestReportDto,
  ) {
    return this.notificationsReportsService.requestReport(principal, dto);
  }

  @Get('reports/:reportId')
  async getReportById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reportId') reportId: string,
  ) {
    return this.notificationsReportsService.getReportById(principal, reportId);
  }

  @Post('reports/:reportId/access')
  @Idempotent('report.share_grant')
  async grantReportAccess(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reportId') reportId: string,
    @Body() dto: GrantReportAccessDto,
  ) {
    return this.notificationsReportsService.grantReportAccess(principal, reportId, dto);
  }

  @Delete('reports/:reportId/access/:accessId')
  async revokeReportAccess(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reportId') reportId: string,
    @Param('accessId') accessId: string,
  ) {
    return this.notificationsReportsService.revokeReportAccess(principal, reportId, accessId);
  }
}
