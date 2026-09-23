import { NextRequest, NextResponse } from "next/server";
import { driverReject } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const driverId = String(body.driverId ?? "");
  if (!driverId) return NextResponse.json({ error: "driverId is required" }, { status: 400 });

  try {
    const result = await driverReject(normalizeId(id), driverId);
    if (result.error) return NextResponse.json({ error: result.error, booking: result.booking }, { status: 400 });
    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
