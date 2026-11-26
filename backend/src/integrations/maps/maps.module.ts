import { Module } from '@nestjs/common';
import { DIRECTIONS_ADAPTER, SandboxDirectionsAdapter } from './directions.adapter';

@Module({
  providers: [
    SandboxDirectionsAdapter,
    {
      provide: DIRECTIONS_ADAPTER,
      useExisting: SandboxDirectionsAdapter,
    },
  ],
  exports: [DIRECTIONS_ADAPTER, SandboxDirectionsAdapter],
})
export class MapsModule {}
