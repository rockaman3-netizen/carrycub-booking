import { NextRequest, NextResponse } from "next/server";
import { createBooking, listBookings, listBookingsForDriver } from "@/lib/sheets";
import { generateBookingId, normalizeId, validateBooking, type BookingInput } from "@/lib/booking";
import { estimateFare } from "@/lib/fare";
import { isAdminRequest } from "@/lib/admin-api-auth";

// Real, in-range coordinates only — never pass through garbage a caller
// (or a buggy/offline geocode) might send. Anything else is treated the
// same as "couldn't resolve this address": null, not a fabricated point.
function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

export async function GET(req: NextRequest) {
  const driverId = req.nextUrl.searchParams.get("driverId");
  try {
    if (driverId) {
      // A driver's own assigned bookings — no admin password needed, same
      // trust level as the rest of the test-only driver login.
      const bookings = await listBookingsForDriver(driverId);
      return NextResponse.json({ bookings });
    }
    if (!isAdminRequest(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const bookings = await listBookings();
    return NextResponse.json({ bookings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const input: BookingInput = {
    pickup: String(body.pickup ?? ""),
    drop: String(body.drop ?? ""),
    vehicleId: String(body.vehicleId ?? ""),
    name: String(body.name ?? ""),
    mobile: String(body.mobile ?? ""),
    notes: String(body.notes ?? ""),
  };
  const errors = validateBooking(input);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Invalid booking", errors }, { status: 400 });
  }

  // Real coordinates only, and never a fabricated point.
  const pickupLoc = validCoord(body.pickupLoc?.lat, body.pickupLoc?.lng);
  const dropLoc = validCoord(body.dropLoc?.lat, body.dropLoc?.lng);

  // The fare/distance shown to the customer is computed client-side (for a
  // live preview as they type), but it must never be trusted as-is here —
  // a request sent directly to this API (bypassing the UI) could otherwise
  // quote itself any price. Recompute from the real coordinates using the
  // same fare.ts logic and ignore whatever the client sent; same "never a
  // fabricated number" rule as everywhere else — null if either point
  // didn't resolve, never a guess.
  const fare = pickupLoc && dropLoc ? estimateFare(input.vehicleId, pickupLoc, dropLoc) : null;

  // The ID can be supplied by the client (generated before submitting, so
  // it can navigate to /booking/:id/confirmed immediately) but must be
  // normalized the same way every lookup route normalizes it — otherwise a
  // differently-cased ID would be stored under one form and become
  // unfindable via GET/cancel/assign/etc, which all normalize first.
  const id = normalizeId(typeof body.id === "string" && body.id ? body.id : generateBookingId());

  try {
    const booking = await createBooking({
      id,
      createdAt: new Date().toISOString(),
      pickup: input.pickup,
      drop: input.drop,
      pickupLat: pickupLoc?.lat ?? null,
      pickupLng: pickupLoc?.lng ?? null,
      dropLat: dropLoc?.lat ?? null,
      dropLng: dropLoc?.lng ?? null,
      vehicleId: input.vehicleId,
      name: input.name,
      mobile: input.mobile,
      notes: input.notes,
      distanceKm: fare?.distanceKm ?? null,
      estimatedFare: fare?.fare ?? null,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if ((err as Error).message === "DUPLICATE_BOOKING_ID") {
      return NextResponse.json({ error: "A booking with this ID already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
