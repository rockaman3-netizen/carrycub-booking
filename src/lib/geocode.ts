// Turns a typed address into real coordinates using OpenStreetMap's Nominatim
// search API — the same map data source as the Leaflet map itself. This is a
// public, free service; per its usage policy, don't hammer it (we cache every
// result so the same address is never looked up twice from this browser).
//
// IMPORTANT: this never invents a location. If Nominatim can't resolve an
// address (typo, offline, rate-limited, no match), we return null and the
// caller simply doesn't plot that point — it does not fall back to a guess.

export type LatLng = { lat: number; lng: number };

export type AddressSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

// "pickup" biases toward Jamshedpur/Adityapur (CarryCub's actual pickup
// service area) and, for autocomplete, hard-restricts suggestions to it.
// "drop" biases toward the whole state of Jharkhand instead, since CarryCub
// delivers anywhere in-state. Defaults to "drop" for callers that don't care.
export type GeoScope = "pickup" | "drop";

// Approx bounding box around the Jamshedpur + Adityapur urban area —
// CarryCub's actual pickup service area today.
export const PICKUP_SERVICE_BOUNDS = {
  minLat: 22.62,
  maxLat: 22.92,
  minLng: 85.98,
  maxLng: 86.32,
};

// Loose bounding box for the state of Jharkhand — used only to bias (not
// restrict) drop-location results toward the state.
const JHARKHAND_BOUNDS = {
  minLat: 21.9,
  maxLat: 25.35,
  minLng: 83.3,
  maxLng: 87.9,
};

/** Whether a resolved point falls inside CarryCub's pickup service area. */
export function isWithinPickupServiceArea(loc: LatLng): boolean {
  return (
    loc.lat >= PICKUP_SERVICE_BOUNDS.minLat &&
    loc.lat <= PICKUP_SERVICE_BOUNDS.maxLat &&
    loc.lng >= PICKUP_SERVICE_BOUNDS.minLng &&
    loc.lng <= PICKUP_SERVICE_BOUNDS.maxLng
  );
}

const CACHE_PREFIX = "carrycub:geocode:";

// Nominatim occasionally fails transiently — a 429 (rate-limited), a 5xx, or
// a plain network blip (common on mobile data switching towers/VoLTE↔5G).
// Retry those a couple of times with backoff before giving up. A genuine
// "no results" response is NOT retried here — that's a real answer, not a
// glitch — the caller handles that case itself.
async function fetchWithRetry(
  url: string,
  attempts = 3,
  delayMs = 600,
): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok || !(res.status === 429 || res.status >= 500)) {
        // Success, or a non-retryable error (e.g. a bad request) — stop here.
        return res;
      }
    } catch {
      // Network error — fall through to retry below.
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return null;
}

function cacheGet(key: string): LatLng | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw === null) return undefined; // not cached yet
    return raw === "null" ? null : (JSON.parse(raw) as LatLng);
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, value: LatLng | null) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: skip caching, still return the result */
  }
}

function viewboxParam(b: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): string {
  // Nominatim's viewbox format is "left,top,right,bottom" = minLng,maxLat,maxLng,minLat.
  return `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`;
}

// CarryCub only serves Jamshedpur/Adityapur for pickup, and (for drop) all
// of Jharkhand — bias the search accordingly unless the address already
// names the relevant place, so short inputs like "Bistupur" resolve to the
// right city instead of a random global match.
function buildQuery(trimmed: string, scope: GeoScope): string {
  if (scope === "pickup") {
    return /jamshedpur|adityapur/i.test(trimmed)
      ? trimmed
      : `${trimmed}, Jamshedpur, Jharkhand, India`;
  }
  return /jharkhand/i.test(trimmed) ? trimmed : `${trimmed}, Jharkhand, India`;
}

function buildUrl(q: string, limit: number, scope: GeoScope, restrict: boolean): string {
  const base = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`;
  if (scope === "pickup" && restrict) {
    // Autocomplete for pickup only ever offers addresses inside the
    // serviceable area — nothing outside it can even be suggested.
    return `${base}&viewbox=${viewboxParam(PICKUP_SERVICE_BOUNDS)}&bounded=1`;
  }
  if (scope === "drop") {
    // Bias toward Jharkhand without excluding results outside it.
    return `${base}&viewbox=${viewboxParam(JHARKHAND_BOUNDS)}`;
  }
  // Pickup, manual full-address geocode: left unrestricted on purpose so a
  // customer who types an out-of-area address still resolves to a real
  // point — the caller then checks isWithinPickupServiceArea() itself and
  // shows a clean "not serviceable" message, instead of this silently
  // returning nothing.
  return base;
}

/**
 * Resolves a free-text address to real lat/lng via OSM Nominatim.
 * Returns null (never a fabricated point) if it can't be resolved.
 */
export async function geocodeAddress(
  address: string,
  scope: GeoScope = "drop",
): Promise<LatLng | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cacheKey = `${scope}:${trimmed}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const q = buildQuery(trimmed, scope);

  try {
    const res = await fetchWithRetry(buildUrl(q, 1, scope, false));
    if (!res || !res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      cacheSet(cacheKey, null);
      return null;
    }
    const loc: LatLng = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    if (Number.isNaN(loc.lat) || Number.isNaN(loc.lng)) {
      cacheSet(cacheKey, null);
      return null;
    }
    cacheSet(cacheKey, loc);
    return loc;
  } catch {
    return null; // offline / blocked — never substitute a fake location
  }
}

/**
 * Live-suggestions for the pickup/drop autocomplete dropdown. Returns up to
 * `limit` candidate addresses with their coordinates. For "pickup", results
 * are hard-restricted to CarryCub's serviceable Jamshedpur/Adityapur area;
 * for "drop", results are biased toward Jharkhand but not restricted to it.
 * Returns an empty array — never a fabricated suggestion — if nothing
 * matches or the request fails.
 */
export async function searchAddressSuggestions(
  query: string,
  limit = 5,
  scope: GeoScope = "drop",
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const q = buildQuery(trimmed, scope);

  try {
    const res = await fetchWithRetry(buildUrl(q, limit, scope, true));
    if (!res || !res.ok) return [];
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    return data
      .map((d) => ({
        label: d.display_name,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
      }))
      .filter((s) => !Number.isNaN(s.lat) && !Number.isNaN(s.lng));
  } catch {
    return []; // offline / blocked — no suggestions, never fabricated ones
  }
}

/**
 * The pickup field's "Use current location" button (in BookingForm) writes
 * real device GPS coordinates straight into the text as
 * "Current location (12.34567, 86.12345)". When that's what the customer
 * used, parse the exact coordinates back out instead of re-geocoding the
 * string (which would just re-derive the same point, less precisely).
 */
export function parseCurrentLocationString(text: string): LatLng | null {
  const m = text.trim().match(/^Current location \(([-\d.]+),\s*([-\d.]+)\)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
