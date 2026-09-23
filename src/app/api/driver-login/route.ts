import { NextRequest, NextResponse } from "next/server";
import { getDriverByPhone } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = String(body.phone ?? "").trim();
  if (!phone) return NextResponse.json({ error: "Phone number is required" }, { status: 400 });

  try {
    const driver = await getDriverByPhone(phone);
    if (!driver) return NextResponse.json({ error: "No driver found with that phone number" }, { status: 404 });
    return NextResponse.json({ driver });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
