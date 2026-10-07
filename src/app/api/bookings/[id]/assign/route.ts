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

    const bookingId = normalizeId(id);

    // 1) Driver ko: data-only high-priority push.
    // Android app (RingService) isse lambi looping ring bajata hai.
    // Never breaks the response if push fails.
    try {
      const tokens = await listTokens(["driver"]);
      const driverTokens = tokens
        .map((t) => t as unknown as { token: string; driverId?: string | null })
        .filter((t) => String(t.driverId ?? "").trim() === driverId.trim());
      if (driverTokens.length > 0) {
        await sendPushToTokens(
          driverTokens.map((t) => t.token),
          "Naya Trip Assign Hua!",
          `Booking #${bookingId} aapko assign hui hai. App kholkar Accept karein.`,
          { type: "booking_assigned", bookingId },
          { channelId: "driver_assign_channel", sound: "driver_ring", dataOnly: true },
        );
      } else {
        console.warn(`Driver-assign push skipped: no registered token for driverId "${driverId}"`);
      }
    } catch (pushErr) {
      console.error("Driver-assign push failed", pushErr);
    }

    // 2) Customer ko: "booking confirm ho gayi, driver assign hua" notification + tone.
    // Alag try/catch, taaki iske fail hone par driver ki ring ya response par asar na pade.
    try {
      const customerTokens = (await listTokens(["customer"]))
        .map((t) => t as unknown as { token: string; bookingId?: string | null })
        .filter((t) => String(t.bookingId ?? "").trim().toUpperCase() === bookingId.toUpperCase());
      if (customerTokens.length > 0) {
        const driverName = (driver as unknown as { name?: string }).name;
        await sendPushToTokens(
          customerTokens.map((t) => t.token),
          "Booking Confirm Ho Gayi!",
          driverName
            ? `Aapki booking #${bookingId} ke liye driver ${driverName} assign ho gaye hain.`
            : `Aapki booking #${bookingId} ke liye driver assign ho gaye hain.`,
          { type: "driver_assigned", bookingId },
          { channelId: "driver_accept_channel", sound: "notification_sound" },
        );
      } else {
        console.warn(`Customer confirm push skipped: no registered token for booking "${bookingId}"`);
      }
    } catch (pushErr) {
      console.error("Customer confirm push failed", pushErr);
    }

    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
