import { Module } from '@nestjs/common';
import {
  ENVIRONMENTAL_PROVIDER_ADAPTER,
  SandboxRwandaEnvironmentalAdapter,
} from './weather.adapter';

@Module({
  providers: [
    SandboxRwandaEnvironmentalAdapter,
    {
      provide: ENVIRONMENTAL_PROVIDER_ADAPTER,
      useExisting: SandboxRwandaEnvironmentalAdapter,
    },
  ],
  exports: [ENVIRONMENTAL_PROVIDER_ADAPTER, SandboxRwandaEnvironmentalAdapter],
})
export class WeatherIntegrationModule {}
