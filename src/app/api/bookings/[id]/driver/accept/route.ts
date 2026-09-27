import { NextRequest, NextResponse } from "next/server";
import { driverAccept, listTokens } from "@/lib/sheets";
import { normalizeId } from "@/lib/booking";
import { sendPushToTokens } from "@/lib/push";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const driverId = String(body.driverId ?? "");
  if (!driverId) return NextResponse.json({ error: "driverId is required" }, { status: 400 });

  try {
    const result = await driverAccept(normalizeId(id), driverId);
    if (result.error) return NextResponse.json({ error: result.error, booking: result.booking }, { status: 400 });

    // Driver accepted → notify the customer on their registered device,
    // via the native Android channel (custom tone), never breaks the
    // response if push fails.
    try {
      const tokens = await listTokens(["customer"]);
      const customerTokens = tokens.filter((t) => t.bookingId === normalizeId(id));
      if (customerTokens.length > 0) {
        await sendPushToTokens(
          customerTokens.map((t) => t.token),
          "Driver Accepted!",
          `${result.booking?.driverName ?? "Your driver"} is on the way.`,
          { type: "driver_accepted", bookingId: normalizeId(id) },
          { channelId: "driver_accept_channel", sound: "notification_sound" },
        );
      }
    } catch (pushErr) {
      console.error("Driver-accept push failed", pushErr);
    }

    return NextResponse.json({ booking: result.booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
