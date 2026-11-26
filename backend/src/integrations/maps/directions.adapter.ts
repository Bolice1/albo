import { Injectable } from '@nestjs/common';

export const DIRECTIONS_ADAPTER = Symbol('DIRECTIONS_ADAPTER');

export type TravelMode = 'driving' | 'walking';

export interface CoarseCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Privacy-preserving directions input (FR-028, T-025, T-036):
 * Contains ONLY coarse origin and facility destination coordinates — never user IDs,
 * names, tokens, or health attributes. Caller coordinates are never persisted or logged.
 */
export interface DirectionsRequest {
  origin: CoarseCoordinate;
  destination: CoarseCoordinate;
  travelMode?: TravelMode;
}

export interface DirectionsSummaryResult {
  directions_available: boolean;
  provider_name: string;
  distance_km: number | null;
  estimated_travel_minutes: number | null;
  travel_mode: TravelMode;
  route_summary_note: string;
  unavailable_reason?: string | null;
}

export interface DirectionsAdapter {
  computeDirectionsSummary(request: DirectionsRequest): Promise<DirectionsSummaryResult>;
}

const EARTH_RADIUS_KM = 6371;
const ROAD_WINDING_FACTOR = 1.25;
const MAX_ROUTING_DISTANCE_KM = 500;
const DRIVING_AVG_KMH = 35;
const WALKING_AVG_KMH = 4.5;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isValidCoordinate(coord: CoarseCoordinate): boolean {
  return (
    Number.isFinite(coord.latitude) &&
    Number.isFinite(coord.longitude) &&
    coord.latitude >= -90 &&
    coord.latitude <= 90 &&
    coord.longitude >= -180 &&
    coord.longitude <= 180
  );
}

export function buildUnavailableDirectionsSummary(
  travelMode: TravelMode = 'driving',
  reason = 'DIRECTIONS_PROVIDER_UNAVAILABLE',
): DirectionsSummaryResult {
  return {
    directions_available: false,
    provider_name: 'albo_sandbox_directions_v1',
    distance_km: null,
    estimated_travel_minutes: null,
    travel_mode: travelMode,
    route_summary_note:
      'Directions are currently unavailable. Use the verified facility address and contact details provided, and call ahead to confirm service availability.',
    unavailable_reason: reason,
  };
}

@Injectable()
export class SandboxDirectionsAdapter implements DirectionsAdapter {
  private simulatedAvailable = true;

  /**
   * Test/sandbox control to deterministically verify graceful degradation
   * when an external map/routing provider is unreachable (SYSTEM_DESIGN.md §16).
   */
  setSimulatedAvailable(available: boolean): void {
    this.simulatedAvailable = available;
  }

  isSimulatedAvailable(): boolean {
    return this.simulatedAvailable;
  }

  async computeDirectionsSummary(request: DirectionsRequest): Promise<DirectionsSummaryResult> {
    const travelMode: TravelMode = request.travelMode ?? 'driving';

    if (!this.simulatedAvailable) {
      return buildUnavailableDirectionsSummary(travelMode, 'DIRECTIONS_PROVIDER_UNAVAILABLE');
    }

    if (!isValidCoordinate(request.origin) || !isValidCoordinate(request.destination)) {
      return buildUnavailableDirectionsSummary(travelMode, 'INVALID_ROUTING_COORDINATES');
    }

    const dLat = toRadians(request.destination.latitude - request.origin.latitude);
    const dLon = toRadians(request.destination.longitude - request.origin.longitude);
    const lat1 = toRadians(request.origin.latitude);
    const lat2 = toRadians(request.destination.latitude);

    const haversine =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    const straightLineKm = EARTH_RADIUS_KM * centralAngle;

    if (straightLineKm > MAX_ROUTING_DISTANCE_KM) {
      return buildUnavailableDirectionsSummary(travelMode, 'OUTSIDE_SUPPORTED_ROUTING_BOUNDS');
    }

    const estimatedRoadKm = Math.round(straightLineKm * ROAD_WINDING_FACTOR * 10) / 10;
    const speedKmh = travelMode === 'walking' ? WALKING_AVG_KMH : DRIVING_AVG_KMH;
    const rawMinutes = (estimatedRoadKm / speedKmh) * 60;
    const estimatedTravelMinutes = Math.max(1, Math.round(rawMinutes));

    return {
      directions_available: true,
      provider_name: 'albo_sandbox_directions_v1',
      distance_km: estimatedRoadKm,
      estimated_travel_minutes: estimatedTravelMinutes,
      travel_mode: travelMode,
      route_summary_note:
        'Estimated coarse travel summary (synthetic sandbox). Routing estimates do not confirm real-time facility hours, staffing, or emergency readiness.',
      unavailable_reason: null,
    };
  }
}
