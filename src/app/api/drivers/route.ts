import { NextRequest, NextResponse } from "next/server";
import { listDrivers } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const drivers = await listDrivers();
    return NextResponse.json({ drivers });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
