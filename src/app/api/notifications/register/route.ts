// src/app/api/notifications/register/route.ts
import { NextResponse } from "next/server";
import { saveDeviceToken, type DeviceTokenRole } from "@/lib/sheets";
import { sendPushToTokens } from "@/lib/push";

export const runtime = "edge";

const VALID_ROLES: DeviceTokenRole[] = ["admin", "driver", "customer"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const role = body?.role as DeviceTokenRole;
  const driverId = typeof body?.driverId === "string" ? body.driverId : null;
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : null;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    await saveDeviceToken({ token, role, driverId, bookingId });
  } catch (err) {
    console.error("saveDeviceToken failed", err);
    return NextResponse.json({ error: "Could not save token" }, { status: 500 });
  }

  // Customer's first registration for a booking → send an immediate
  // "Booking Confirmed" push straight to this device.
  if (role === "customer" && bookingId) {
    try {
      await sendPushToTokens(
        [token],
        "Booking Confirmed",
        `Aapki booking #${bookingId} confirm ho gayi hai. Hum jaldi hi driver assign karenge.`,
        { type: "booking_confirmed", bookingId },
      );
    } catch (err) {
      console.error("Confirmation push failed", err);
      // token save ho chuka hai, push fail hui to bhi request fail nahi karni
    }
  }

  return NextResponse.json({ ok: true });
}
