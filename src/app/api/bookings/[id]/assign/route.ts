import { NextRequest, NextResponse } from "next/server";
import { assignDriver, getDriver } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";
import { isAdminRequest } from "@/lib/admin-api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const driverId = String(body.driverId ?? "");
  if (!driverId) return NextResponse.json({ error: "driverId is required" }, { status: 400 });

  try {
    const driver = await getDriver(driverId);
    if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    const result = await assignDriver(normalizeId(id), driver);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
