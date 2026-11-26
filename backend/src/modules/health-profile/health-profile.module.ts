import { Module } from '@nestjs/common';
import { FacilitiesCareModule } from '@modules/facilities-care/facilities-care.module';
import { MeHealthProfileController } from './health-profile.controller';
import { HealthProfileService } from './health-profile.service';

@Module({
  imports: [FacilitiesCareModule],
  controllers: [MeHealthProfileController],
  providers: [HealthProfileService],
  exports: [HealthProfileService],
})
export class HealthProfileModule {}
