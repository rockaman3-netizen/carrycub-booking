import type { LatLng } from "@/lib/geocode";

/**
 * Great-circle ("straight-line") distance in km between two points.
 *
 * TEST-ONLY stand-in for a real routing service. No routing API is wired
 * into this build, so this is the clearly-marked test distance calculation
 * — see TEST_ROAD_DISTANCE_FACTOR in fareConfig.ts for the fudge factor
 * applied on top of it to roughly approximate road distance.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Earth radius, km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
