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

/**
 * Resolves a free-text address to real lat/lng via OSM Nominatim.
 * Returns null (never a fabricated point) if it can't be resolved.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cached = cacheGet(trimmed);
  if (cached !== undefined) return cached;

  // CarryCub only serves Jamshedpur/Adityapur today — bias the search there
  // unless the address already names a city, so short inputs like
  // "Bistupur" resolve to the right place instead of a random global match.
  const q = /jamshedpur|adityapur|jharkhand|jamshedpur/i.test(trimmed)
    ? trimmed
    : `${trimmed}, Jamshedpur, Jharkhand, India`;

  try {
    const res = await fetchWithRetry(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
    );
    if (!res || !res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      cacheSet(trimmed, null);
      return null;
    }
    const loc: LatLng = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    if (Number.isNaN(loc.lat) || Number.isNaN(loc.lng)) {
      cacheSet(trimmed, null);
      return null;
    }
    cacheSet(trimmed, loc);
    return loc;
  } catch {
    return null; // offline / blocked — never substitute a fake location
  }
}

/**
 * Live-suggestions for the pickup/drop autocomplete dropdown. Returns up to
 * `limit` candidate addresses with their coordinates, biased toward
 * Jamshedpur/Adityapur (same rule as geocodeAddress). Returns an empty
 * array — never a fabricated suggestion — if nothing matches or the
 * request fails.
 */
export async function searchAddressSuggestions(
  query: string,
  limit = 5,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const q = /jamshedpur|adityapur|jharkhand/i.test(trimmed)
    ? trimmed
    : `${trimmed}, Jamshedpur, Jharkhand, India`;

  try {
    const res = await fetchWithRetry(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`,
    );
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
