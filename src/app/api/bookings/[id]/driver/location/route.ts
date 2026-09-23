import { NextRequest, NextResponse } from "next/server";
import { getBooking, upsertLocation } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizeId(rawId);
  const body = await req.json();
  const driverId = String(body.driverId ?? "");
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const validCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (!driverId || !validCoords) {
    return NextResponse.json({ error: "driverId, lat, and lng are required" }, { status: 400 });
  }

  try {
    const current = await getBooking(id);
    if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (current.driverId !== driverId) {
      return NextResponse.json({ error: "This booking isn't assigned to you" }, { status: 403 });
    }
    if (current.status === "delivered" || current.status === "cancelled") {
      return NextResponse.json({ error: "Booking finished; location sharing stopped" }, { status: 400 });
    }
    const driverLocation = await upsertLocation(id, driverId, lat, lng);
    return NextResponse.json({ booking: { ...current, driverLocation } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
