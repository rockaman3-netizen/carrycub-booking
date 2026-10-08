import { NextRequest, NextResponse } from "next/server";
import { listTokens } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";
import { sendPushToTokens } from "@/lib/push";

// TEMPORARY diagnostic page. Kaam hone ke baad ise delete kar dena.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(
      { error: "Unauthorized. Isi browser me pehle admin login karo, phir ye link dobara kholo." },
      { status: 401 },
    );
  }

  try {
    const all = (await listTokens(["admin", "driver", "customer"])) as unknown as Array<
      Record<string, unknown>
    >;

    const summary = all.map((t) => ({
      role: t.role ?? null,
      driverId: t.driverId ?? null,
      bookingId: t.bookingId ?? null,
      tokenTail: String(t.token ?? "").slice(-8),
    }));

    const counts = {
      admin: summary.filter((s) => s.role === "admin").length,
      driver: summary.filter((s) => s.role === "driver").length,
      customer: summary.filter((s) => s.role === "customer").length,
    };

    const send = req.nextUrl.searchParams.get("send");
    const driverId = (req.nextUrl.searchParams.get("driverId") || "").trim();

    // Test ring: ?send=1&driverId=XXXX
    let testResult: unknown = "test ring nahi bheji (link me ?send=1&driverId=... lagao)";
    if (send === "1" && driverId) {
      const driverTokens = all
        .filter((t) => t.role === "driver" && String(t.driverId ?? "").trim() === driverId)
        .map((t) => String(t.token ?? ""))
        .filter(Boolean);

      if (driverTokens.length === 0) {
        testResult = `driverId "${driverId}" ke liye koi token mila hi nahi`;
      } else {
        const results = await sendPushToTokens(
          driverTokens,
          "TEST: Naya Trip Assign Hua!",
          "Ye test ring hai.",
          { type: "booking_assigned", bookingId: "TEST" },
          { channelId: "driver_assign_channel", sound: "driver_ring", dataOnly: true },
        );
        testResult = { tokensTried: driverTokens.length, results };
      }
    }

    return NextResponse.json({ counts, tokens: summary, testResult });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
