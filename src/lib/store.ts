import { normalizeId, type Booking, type LatLng } from "@/lib/booking";
import { type StatusId } from "@/lib/status";
import { adminHeaders } from "@/lib/admin-auth";
import { clearActiveBookingId } from "@/lib/recent-bookings";

export { normalizeId };

// Bookings live in Google Sheets now (see src/lib/sheets.ts, used from the
// API routes under src/app/api/bookings/**). Every function here just calls
// those routes — same names/shapes as the old localStorage version, but
// async, since it's a real network call now.
export type DriverLocation = { lat: number; lng: number; updatedAt: string };
export type StoredBooking = Booking & {
  status: StatusId;
  driverId?: string;
  // Denormalized onto the booking row at assign time, so the UI never has
  // to do a second lookup against the Drivers sheet just to show a name.
  driverName?: string;
  driverPhone?: string;
  driverVehicleNo?: string;
  driverVehicleType?: string;
  driverLocation?: DriverLocation;
};

// The API returns flat lat/lng columns; the rest of the app expects the
// original { lat, lng } | null shape for pickupLoc/dropLoc.
function fromApi(b: Record<string, unknown> | null): StoredBooking | null {
  if (!b) return null;
  const loc = (lat: unknown, lng: unknown): LatLng | null =>
    typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  return {
    id: b.id as string,
    createdAt: b.createdAt as string,
    status: b.status as StatusId,
    pickup: b.pickup as string,
    drop: b.drop as string,
    vehicleId: b.vehicleId as string,
    name: b.name as string,
    mobile: b.mobile as string,
    notes: b.notes as string,
    pickupLoc: loc(b.pickupLat, b.pickupLng),
    dropLoc: loc(b.dropLat, b.dropLng),
    distanceKm: (b.distanceKm as number | null) ?? undefined,
    estimatedFare: (b.estimatedFare as number | null) ?? undefined,
    driverId: (b.driverId as string | null) ?? undefined,
    driverName: (b.driverName as string | null) ?? undefined,
    driverPhone: (b.driverPhone as string | null) ?? undefined,
    driverVehicleNo: (b.driverVehicleNo as string | null) ?? undefined,
    driverVehicleType: (b.driverVehicleType as string | null) ?? undefined,
    driverLocation: (b.driverLocation as DriverLocation | null) ?? undefined,
  };
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function saveBooking(booking: Booking): Promise<StoredBooking | null> {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(booking),
  });
  const data = await readJson(res);
  if (!res.ok) return null;
  return fromApi(data.booking);
}

export async function getBooking(id: string): Promise<StoredBooking | null> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}`);
  const data = await readJson(res);
  if (!res.ok) return null;
  const booking = fromApi(data.booking);
  // A finished trip is no longer "in progress" for the customer app.
  if (booking && (booking.status === "delivered" || booking.status === "cancelled")) {
    clearActiveBookingId(booking.id);
  }
  return booking;
}

// Driver detail screen: tells "really not found" apart from a network or
// server error, so a temporary hiccup doesn't show "Booking not found".
export type FetchBookingResult =
  | { kind: "ok"; booking: StoredBooking }
  | { kind: "notFound" }
  | { kind: "error" };

export async function fetchBooking(id: string): Promise<FetchBookingResult> {
  try {
    const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}`, { cache: "no-store" });
    if (res.status === 404) return { kind: "notFound" };
    if (!res.ok) return { kind: "error" };
    const data = await readJson(res);
    const booking = fromApi(data.booking ?? null);
    if (!booking) return { kind: "notFound" };
    if (booking.status === "delivered" || booking.status === "cancelled") {
      clearActiveBookingId(booking.id);
    }
    return { kind: "ok", booking };
  } catch {
    return { kind: "error" };
  }
}

// Admin-only: the full booking list.
export async function listBookings(): Promise<StoredBooking[]> {
  const res = await fetch("/api/bookings", { headers: adminHeaders() });
  if (!res.ok) return [];
  const data = await readJson(res);
  return ((data.bookings as Record<string, unknown>[] | undefined) ?? [])
    .map(fromApi)
    .filter((b): b is StoredBooking => b !== null);
}

export async function listDriverBookings(driverId: string): Promise<StoredBooking[]> {
  const res = await fetch(`/api/bookings?driverId=${encodeURIComponent(driverId)}`);
  if (!res.ok) return [];
  const data = await readJson(res);
  return ((data.bookings as Record<string, unknown>[] | undefined) ?? [])
    .map(fromApi)
    .filter((b): b is StoredBooking => b !== null);
}

// Customer-side cancel only (the old generic updateStatus was only ever
// called with "cancelled").
export async function cancelBooking(id: string): Promise<StoredBooking | null> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/cancel`, { method: "POST" });
  const data = await readJson(res);
  if (!res.ok) return null;
  clearActiveBookingId(normalizeId(id));
  return fromApi(data.booking);
}

// ---- Admin operations ----

export async function assignDriver(id: string, driverId: string): Promise<StoredBooking | null> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ driverId }),
  });
  const data = await readJson(res);
  if (!res.ok) return null;
  return fromApi(data.booking);
}

export async function changeStatus(
  id: string,
  status: StatusId,
): Promise<{ booking: StoredBooking | null; error?: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ status }),
  });
  const data = await readJson(res);
  return { booking: fromApi(data.booking ?? null), error: res.ok ? undefined : data.error ?? "Request failed" };
}

// ---- Driver operations ----

export async function acceptBooking(
  id: string,
  driverId: string,
): Promise<{ booking: StoredBooking | null; error?: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/driver/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId }),
  });
  const data = await readJson(res);
  return { booking: fromApi(data.booking ?? null), error: res.ok ? undefined : data.error ?? "Request failed" };
}

export async function rejectBooking(
  id: string,
  driverId: string,
): Promise<{ booking: StoredBooking | null; error?: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/driver/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId }),
  });
  const data = await readJson(res);
  return { booking: fromApi(data.booking ?? null), error: res.ok ? undefined : data.error ?? "Request failed" };
}

export async function driverAdvanceStatus(
  id: string,
  driverId: string,
  status: StatusId,
): Promise<{ booking: StoredBooking | null; error?: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/driver/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId, status }),
  });
  const data = await readJson(res);
  return { booking: fromApi(data.booking ?? null), error: res.ok ? undefined : data.error ?? "Request failed" };
}

export async function updateDriverLocation(
  id: string,
  driverId: string,
  lat: number,
  lng: number,
): Promise<{ booking: StoredBooking | null; error?: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(normalizeId(id))}/driver/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId, lat, lng }),
  });
  const data = await readJson(res);
  return { booking: fromApi(data.booking ?? null), error: res.ok ? undefined : data.error ?? "Request failed" };
}
