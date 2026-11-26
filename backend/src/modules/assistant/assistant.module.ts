import { Module } from '@nestjs/common';
import { FacilitiesCareModule } from '@modules/facilities-care/facilities-care.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [FacilitiesCareModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
