import { Injectable } from '@nestjs/common';
import { ObservationQualityStatus } from '@prisma/client';
import { DependencyUnavailableException } from '@common/errors/app.exception';

export const ENVIRONMENTAL_PROVIDER_ADAPTER = Symbol('ENVIRONMENTAL_PROVIDER_ADAPTER');

export const APPROVED_RWANDA_AREA_CODES = [
  'RW-KGL-GASABO',
  'RW-KGL-KICUKIRO',
  'RW-KGL-NYARUGENGE',
  'RW-SOUTH-HUYE',
  'RW-NORTH-MUSANZE',
  'RW-EAST-KAYONZA',
  'RW-WEST-RUBAVU',
] as const;

export type ApprovedRwandaAreaCode = (typeof APPROVED_RWANDA_AREA_CODES)[number];

export interface NormalizedEnvironmentalObservation {
  readonly dataSourceCode: string;
  readonly observationType: 'rainfall' | 'temperature' | 'pm25';
  readonly locationAreaId: string;
  readonly value: number;
  readonly unit: string;
  readonly qualityStatus: ObservationQualityStatus;
  readonly observedAt: Date;
  readonly sourceTimestamp: Date;
}

export interface EnvironmentalProviderAdapter {
  fetchAreaObservations(
    areaCode: string,
    referenceTime?: Date,
  ): Promise<NormalizedEnvironmentalObservation[]>;
}

const SYNTHETIC_AREA_BASELINES: Readonly<
  Record<string, { rainfallMm: number; tempCelsius: number; pm25UgM3: number }>
> = {
  'RW-KGL-GASABO': { rainfallMm: 14.5, tempCelsius: 23.4, pm25UgM3: 18.2 },
  'RW-KGL-KICUKIRO': { rainfallMm: 12.0, tempCelsius: 24.1, pm25UgM3: 19.5 },
  'RW-KGL-NYARUGENGE': { rainfallMm: 15.2, tempCelsius: 23.8, pm25UgM3: 22.0 },
  'RW-SOUTH-HUYE': { rainfallMm: 26.8, tempCelsius: 20.6, pm25UgM3: 12.4 },
  'RW-NORTH-MUSANZE': { rainfallMm: 34.0, tempCelsius: 17.9, pm25UgM3: 11.1 },
  'RW-EAST-KAYONZA': { rainfallMm: 8.4, tempCelsius: 25.7, pm25UgM3: 15.0 },
  'RW-WEST-RUBAVU': { rainfallMm: 29.1, tempCelsius: 21.8, pm25UgM3: 14.3 },
};

/**
 * Deterministic sandbox adapter for coarse regional environmental observations in Rwanda
 * until live provider contracts in OPEN-010 are finalized (ADR-017, INTEGRATIONS.md §8).
 * Never accepts or stores citizen GPS coordinates (T-036).
 */
@Injectable()
export class SandboxRwandaEnvironmentalAdapter implements EnvironmentalProviderAdapter {
  private simulatedUnavailable = false;

  setSimulatedUnavailable(unavailable: boolean): void {
    this.simulatedUnavailable = unavailable;
  }

  async fetchAreaObservations(
    areaCode: string,
    referenceTime = new Date(),
  ): Promise<NormalizedEnvironmentalObservation[]> {
    if (this.simulatedUnavailable) {
      throw new DependencyUnavailableException(
        'Sandbox environmental provider is temporarily unavailable.',
      );
    }

    const baseline = SYNTHETIC_AREA_BASELINES[areaCode] ?? {
      rainfallMm: 16.0,
      tempCelsius: 22.0,
      pm25UgM3: 16.5,
    };

    const observedAt = new Date(referenceTime.getTime() - 15 * 60 * 1000);

    return [
      {
        dataSourceCode: 'rwanda_synthetic_meteo_sandbox',
        observationType: 'rainfall',
        locationAreaId: areaCode,
        value: baseline.rainfallMm,
        unit: 'mm',
        qualityStatus: ObservationQualityStatus.observed,
        observedAt,
        sourceTimestamp: observedAt,
      },
      {
        dataSourceCode: 'rwanda_synthetic_meteo_sandbox',
        observationType: 'temperature',
        locationAreaId: areaCode,
        value: baseline.tempCelsius,
        unit: 'celsius',
        qualityStatus: ObservationQualityStatus.observed,
        observedAt,
        sourceTimestamp: observedAt,
      },
      {
        dataSourceCode: 'rwanda_synthetic_air_quality_sandbox',
        observationType: 'pm25',
        locationAreaId: areaCode,
        value: baseline.pm25UgM3,
        unit: 'ug/m3',
        qualityStatus: ObservationQualityStatus.observed,
        observedAt,
        sourceTimestamp: observedAt,
      },
    ];
  }
}
