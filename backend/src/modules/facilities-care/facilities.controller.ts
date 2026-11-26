import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import {
  GetFacilityDetailQueryDto,
  SearchFacilitiesQueryDto,
  SearchProvidersQueryDto,
} from './dto/facilities-care.dto';
import { FacilitiesCareService } from './facilities-care.service';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesCareService: FacilitiesCareService) {}

  @Get()
  async searchFacilities(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: SearchFacilitiesQueryDto,
  ) {
    return this.facilitiesCareService.searchFacilities(principal, query);
  }

  @Get(':facilityId')
  async getFacilityById(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('facilityId') facilityId: string,
    @Query() query: GetFacilityDetailQueryDto,
  ) {
    return this.facilitiesCareService.getFacilityById(principal, facilityId, query);
  }
}

@Controller('providers')
export class ProvidersDirectoryController {
  constructor(private readonly facilitiesCareService: FacilitiesCareService) {}

  @Get()
  async searchPublicProviders(@Query() query: SearchProvidersQueryDto) {
    return this.facilitiesCareService.searchPublicProviders(query);
  }
}
