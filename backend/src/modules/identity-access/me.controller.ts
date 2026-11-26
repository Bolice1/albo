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
import { CursorPaginationQueryDto, PaginatedResult } from '@common/http/pagination.util';
import { RateLimit } from '@common/http/rate-limit.guard';
import { CreateAccountDeletionRequestDto, UpdateProfileDto } from './dto/me.dto';
import {
  AccountDeletionRequestView,
  DataExportView,
  MeService,
  SafeCurrentUserView,
  UserProfileView,
} from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  async getMe(@CurrentUser() principal: AuthenticatedPrincipal): Promise<SafeCurrentUserView> {
    return this.meService.getMe(principal);
  }

  @Get('profile')
  async getProfile(@CurrentUser() principal: AuthenticatedPrincipal): Promise<UserProfileView> {
    return this.meService.getProfile(principal);
  }

  @Patch('profile')
  @RateLimit({ category: 'profile_write', limit: 30, windowSeconds: 60 })
  async updateProfile(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileView> {
    return this.meService.updateProfile(principal, dto);
  }

  @Post('account-deletion-requests')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ category: 'account_deletion', limit: 5, windowSeconds: 60 })
  async requestAccountDeletion(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() _dto: CreateAccountDeletionRequestDto,
  ): Promise<AccountDeletionRequestView> {
    return this.meService.requestAccountDeletion(principal);
  }

  @Post('data-exports')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent('me.data_export')
  @RateLimit({ category: 'data_export', limit: 10, windowSeconds: 60 })
  async createDataExport(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<DataExportView> {
    return this.meService.createDataExport(principal);
  }

  @Get('data-exports')
  async listDataExports(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<DataExportView>> {
    return this.meService.listDataExports(principal, pagination);
  }

  @Get('data-exports/:exportId')
  async getDataExportById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('exportId') exportId: string,
  ): Promise<DataExportView> {
    return this.meService.getDataExportById(principal, exportId);
  }
}
