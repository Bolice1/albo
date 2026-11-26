import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '@common/http/rate-limit.guard';
import { OidcJwtVerifierService } from '@integrations/identity/oidc-jwt-verifier.service';
import { ConsentModule } from '@modules/consent/consent.module';
import { AccessPolicyService } from './access-policy.service';
import { AccountReconciliationService } from './account-reconciliation.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Global()
@Module({
  imports: [ConsentModule],
  controllers: [MeController, AdminController],
  providers: [
    OidcJwtVerifierService,
    AccountReconciliationService,
    AccessPolicyService,
    MeService,
    AdminService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [
    OidcJwtVerifierService,
    AccountReconciliationService,
    AccessPolicyService,
    MeService,
    AdminService,
  ],
})
export class IdentityAccessModule {}
