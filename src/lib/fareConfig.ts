// ---------------------------------------------------------------------
// FARE RULES — TEST PRICING ONLY.
//
// This is the one file to edit when fare rules change. Nothing else in
// the app hardcodes a price; src/lib/fare.ts just reads these numbers.
//
// Keyed by the vehicle `id` values in src/lib/vehicles.ts. The vehicle
// list itself already covers the "Mini Truck / Tata Ace / Pickup" style
// categories the fleet uses today:
//   3-wheeler-tempo → smallest / "mini truck" category
//   tata-ace-7ft     → Tata Ace
//   9-ft-pickup, 10-ft-pickup → Pickup category
//   14-ft-lpt        → largest / heavy loads
// ---------------------------------------------------------------------

export type FareRule = {
  /** Flat starting charge (₹) — covers the includedKm below. */
  baseFare: number;
  /** Distance (km) covered by baseFare before per-km charges start. */
  includedKm: number;
  /** ₹ charged per km beyond includedKm. */
  perKm: number;
  /** The quoted fare is never shown below this floor (₹). */
  minimumFare: number;
};

export const FARE_RULES: Record<string, FareRule> = {
  "3-wheeler-tempo": { baseFare: 290, includedKm: 5, perKm: 106, minimumFare: 290 },
  "tata-ace-7ft": { baseFare: 390, includedKm: 5, perKm: 139, minimumFare: 390 },
  "9-ft-pickup": { baseFare: 450, includedKm: 5, perKm: 187, minimumFare: 450 },
  "10-ft-pickup": { baseFare: 480, includedKm: 5, perKm: 168, minimumFare: 480 },
  "14-ft-lpt": { baseFare: 570, includedKm: 5, perKm: 223, minimumFare: 570 },
};

// Used only if a vehicle id has no entry above, so adding a new vehicle to
// vehicles.ts before pricing it here doesn't silently break the estimator.
export const FALLBACK_FARE_RULE: FareRule = {
  baseFare: 300,
  includedKm: 5,
  perKm: 150,
  minimumFare: 300,
};

// A straight-line ("as the crow flies") distance between two geocoded
// points undercounts real road distance, especially in a river/industrial
// city layout like Jamshedpur. Until a real routing service (OSRM, Google
// Directions, etc.) is wired in, this fudge factor approximates road
// distance for TEST fare estimates only.
export const TEST_ROAD_DISTANCE_FACTOR = 1.35;

export function fareRuleFor(vehicleId: string): FareRule {
  return FARE_RULES[vehicleId] ?? FALLBACK_FARE_RULE;
}
