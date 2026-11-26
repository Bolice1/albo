import { Module } from '@nestjs/common';
import { WeatherIntegrationModule } from '@integrations/weather/weather.module';
import { EnvironmentController } from './environment.controller';
import { EnvironmentService } from './environment.service';

@Module({
  imports: [WeatherIntegrationModule],
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
  exports: [EnvironmentService, WeatherIntegrationModule],
})
export class EnvironmentModule {}
