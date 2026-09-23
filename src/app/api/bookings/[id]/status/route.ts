import { NextRequest, NextResponse } from "next/server";
import { adminChangeStatus } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";
import { ALL_STATUSES, type StatusId } from "@/lib/status";
import { isAdminRequest } from "@/lib/admin-api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const status = body.status as StatusId;
  if (!ALL_STATUSES.some((s) => s.id === status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const result = await adminChangeStatus(normalizeId(id), status);
    if (result.error) return NextResponse.json({ error: result.error, booking: result.booking }, { status: 400 });
    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
