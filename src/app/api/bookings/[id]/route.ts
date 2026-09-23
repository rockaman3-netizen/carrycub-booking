import { NextRequest, NextResponse } from "next/server";
import { getBooking } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const booking = await getBooking(normalizeId(id));
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
