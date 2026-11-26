import { Module } from '@nestjs/common';
import { MapsModule } from '@integrations/maps/maps.module';
import { FacilitiesController, ProvidersDirectoryController } from './facilities.controller';
import { FacilitiesCareService } from './facilities-care.service';
import { ProviderPortalController } from './provider-portal.controller';
import { ReferralsConsultationsController } from './referrals-consultations.controller';

@Module({
  imports: [MapsModule],
  controllers: [
    FacilitiesController,
    ProvidersDirectoryController,
    ReferralsConsultationsController,
    ProviderPortalController,
  ],
  providers: [FacilitiesCareService],
  exports: [FacilitiesCareService, MapsModule],
})
export class FacilitiesCareModule {}
