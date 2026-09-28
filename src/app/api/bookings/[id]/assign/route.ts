import { NextRequest, NextResponse } from "next/server";
import { assignDriver, getDriver, listTokens } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";
import { isAdminRequest } from "@/lib/admin-api-auth";
import { sendPushToTokens } from "@/lib/push";

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

    // Driver assigned -> ring-style push to that driver's registered devices
    // via the native Android channel (custom ring tone). Never breaks the
    // response if push fails.
    try {
      const tokens = await listTokens(["driver"]);
      const driverTokens = tokens
        .map((t) => t as unknown as { token: string; driverId?: string | null })
        .filter((t) => String(t.driverId ?? "").trim() === driverId.trim());
      if (driverTokens.length > 0) {
        await sendPushToTokens(
          driverTokens.map((t) => t.token),
          "Naya Trip Assign Hua!",
          `Booking #${normalizeId(id)} aapko assign hui hai. App kholkar Accept karein.`,
          { type: "booking_assigned", bookingId: normalizeId(id) },
          { channelId: "driver_assign_channel", sound: "driver_ring" },
        );
      }
    } catch (pushErr) {
      console.error("Driver-assign push failed", pushErr);
    }

    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
