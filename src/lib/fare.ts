import type { LatLng } from "@/lib/geocode";
import { haversineKm } from "@/lib/distance";
import { fareRuleFor, TEST_ROAD_DISTANCE_FACTOR } from "@/lib/fareConfig";

export type FareEstimate = {
  vehicleId: string;
  /** TEST distance estimate in km (straight-line × road-distance factor). */
  distanceKm: number;
  /** Estimated fare in ₹, rounded to the nearest ₹10, floored at minimumFare. */
  fare: number;
};

/**
 * Estimates a fare from two real geocoded points and a vehicle type.
 * Distance here is a clearly-marked TEST calculation (see distance.ts) —
 * swap in a routing service's distance/duration once one is available,
 * without touching the fare math below.
 */
export function estimateFare(vehicleId: string, pickup: LatLng, drop: LatLng): FareEstimate {
  const straightKm = haversineKm(pickup, drop);
  const distanceKm = Math.round(straightKm * TEST_ROAD_DISTANCE_FACTOR * 10) / 10;

  const rule = fareRuleFor(vehicleId);
  const billableKm = Math.max(0, distanceKm - rule.includedKm);
  const raw = rule.baseFare + billableKm * rule.perKm;
  const fare = Math.max(rule.minimumFare, Math.round(raw / 10) * 10);

  return { vehicleId, distanceKm, fare };
}
