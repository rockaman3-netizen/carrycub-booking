import { NextRequest, NextResponse } from "next/server";
import { driverAdvance, getBooking } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";
import { nextStatus, type StatusId } from "@/lib/status";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizeId(rawId);
  const body = await req.json();
  const driverId = String(body.driverId ?? "");
  const status = body.status as StatusId;
  if (!driverId) return NextResponse.json({ error: "driverId is required" }, { status: 400 });

  try {
    const current = await getBooking(id);
    if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const expectedNext = nextStatus(current.status);
    const result = await driverAdvance(id, driverId, status, expectedNext);
    if (result.error) return NextResponse.json({ error: result.error, booking: result.booking }, { status: 400 });
    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
