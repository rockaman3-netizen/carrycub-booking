import { NextRequest, NextResponse } from "next/server";
import { customerCancel } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await customerCancel(normalizeId(id));
    if (result.error) return NextResponse.json({ error: result.error, booking: result.booking }, { status: 400 });
    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
