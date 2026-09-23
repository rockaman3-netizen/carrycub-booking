import { NextRequest, NextResponse } from "next/server";
import { setDriverAvailability } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  try {
    const driver = await setDriverAvailability(id, Boolean(body.available));
    if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    return NextResponse.json({ driver });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
