import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RequireRoles } from '@common/decorators/require-roles.decorator';
import { CursorPaginationQueryDto, PaginatedResult } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import { AuditEventView } from '@modules/audit/audit.service';
import { ConsentPurposeView } from '@modules/consent/consent.service';
import {
  AdminAccountView,
  AdminService,
  OrganizationMembershipView,
  OrganizationView,
  ProviderAssignmentView,
  RuleVersionGovernanceView,
} from './admin.service';
import {
  AuditEventsQueryDto,
  CreateOrganizationDto,
  CreateOrganizationMembershipDto,
  CreateProviderAssignmentDto,
  GrantRoleDto,
  UpdateAccountStatusDto,
  UpdateProviderAssignmentDto,
} from './dto/admin.dto';

@Controller('admin')
@RequireRoles(RoleCode.platform_admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get(['accounts', 'users'])
  async listAccounts(
    @Query() pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<AdminAccountView>> {
    return this.adminService.listAccounts(pagination);
  }

  @Patch(['accounts/:accountId/status', 'users/:accountId/status'])
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async updateAccountStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountStatusDto,
  ): Promise<AdminAccountView> {
    return this.adminService.updateAccountStatus(principal, accountId, dto);
  }

  @Post(['accounts/:accountId/roles', 'users/:accountId/roles'])
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async grantRole(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('accountId') accountId: string,
    @Body() dto: GrantRoleDto,
  ): Promise<AdminAccountView> {
    return this.adminService.grantRole(principal, accountId, dto);
  }

  @Delete(['accounts/:accountId/roles/:roleCode', 'users/:accountId/roles/:roleCode'])
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async revokeRole(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('accountId') accountId: string,
    @Param('roleCode') roleCode: string,
  ): Promise<AdminAccountView> {
    return this.adminService.revokeRole(principal, accountId, roleCode);
  }

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async createOrganization(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationView> {
    return this.adminService.createOrganization(principal, dto);
  }

  @Get('organizations')
  async listOrganizations(
    @Query() pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<OrganizationView>> {
    return this.adminService.listOrganizations(pagination);
  }

  @Post('organizations/:orgId/memberships')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async createOrganizationMembership(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('orgId') orgId: string,
    @Body() dto: CreateOrganizationMembershipDto,
  ): Promise<OrganizationMembershipView> {
    return this.adminService.createOrganizationMembership(principal, orgId, dto);
  }

  @Post('provider-assignments')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async createProviderAssignment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: CreateProviderAssignmentDto,
  ): Promise<ProviderAssignmentView> {
    return this.adminService.createProviderAssignment(principal, dto);
  }

  @Patch('provider-assignments/:assignmentId')
  @RateLimit({ category: 'admin_write', limit: 60, windowSeconds: 60 })
  async updateProviderAssignment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateProviderAssignmentDto,
  ): Promise<ProviderAssignmentView> {
    return this.adminService.updateProviderAssignment(principal, assignmentId, dto);
  }

  @Get('consent-purposes')
  async listConsentPurposes(): Promise<ConsentPurposeView[]> {
    return this.adminService.listConsentPurposes();
  }

  @Get('rule-versions')
  async listRuleVersions(): Promise<RuleVersionGovernanceView[]> {
    return this.adminService.listRuleVersions();
  }

  @Get('audit-events')
  async listAuditEvents(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AuditEventsQueryDto,
  ): Promise<PaginatedResult<AuditEventView>> {
    return this.adminService.listAuditEvents(principal, query);
  }
}
