import { NextRequest, NextResponse } from "next/server";
import { listTokens } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";
import { sendPushToTokens } from "@/lib/push";

// TEMPORARY diagnostic page. Kaam hone ke baad ise delete kar dena.
export const dynamic = "force-dynamic";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123";

export async function GET(req: NextRequest) {
  // Browser ka seedha link header nahi bhej sakta, isliye ?pw= bhi chalega.
  const pw = req.nextUrl.searchParams.get("pw");
  if (!isAdminRequest(req) && pw !== ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Unauthorized. Link ke aakhir me ?pw=APNA_ADMIN_PASSWORD lagao." },
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

    // Test ring: &send=1  (saare driver tokens par) ya &send=1&driverId=XXXX (sirf ek driver par)
    const send = req.nextUrl.searchParams.get("send");
    const driverId = (req.nextUrl.searchParams.get("driverId") || "").trim();

    let testResult: unknown = "test ring nahi bheji (link me &send=1 lagao)";
    if (send === "1") {
      const driverTokens = all
        .filter(
          (t) =>
            t.role === "driver" &&
            (!driverId || String(t.driverId ?? "").trim() === driverId),
        )
        .map((t) => String(t.token ?? ""))
        .filter(Boolean);

      if (driverTokens.length === 0) {
        testResult = "koi driver token mila hi nahi";
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
