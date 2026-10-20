import { NextRequest, NextResponse } from "next/server";
import { listTokens } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";
import { sendPushToTokens } from "@/lib/push";

// TEMPORARY diagnostic page. Kaam hone ke baad ise delete kar dena.
export const dynamic = "force-dynamic";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123";

// Links:
//   ?pw=...                  -> sirf list (kaun se token Sheet me hain)
//   ?pw=...&send=driver      -> driver tokens par test ring   (send=1 bhi chalega)
//   ?pw=...&send=admin       -> admin tokens par test notification
//   ?pw=...&send=customer    -> customer tokens par test notification
export async function GET(req: NextRequest) {
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
      createdAt: t.createdAt ?? null,
      tokenTail: String(t.token ?? "").slice(-8),
    }));

    const counts = {
      admin: summary.filter((s) => s.role === "admin").length,
      driver: summary.filter((s) => s.role === "driver").length,
      customer: summary.filter((s) => s.role === "customer").length,
    };

    const sendParam = (req.nextUrl.searchParams.get("send") || "").trim();
    const target = sendParam === "1" ? "driver" : sendParam;

    let testResult: unknown = "test nahi bheja (link me &send=driver / admin / customer lagao)";

    if (target === "driver" || target === "admin" || target === "customer") {
      const tokens = all
        .filter((t) => t.role === target)
        .map((t) => String(t.token ?? ""))
        .filter(Boolean);

      if (tokens.length === 0) {
        testResult = `${target} ka koi token Sheet me mila hi nahi`;
      } else if (target === "driver") {
        const results = await sendPushToTokens(
          tokens,
          "TEST: Naya Trip Assign Hua!",
          "Ye test ring hai.",
          { type: "booking_assigned", bookingId: "TEST" },
          { channelId: "driver_assign_channel", sound: "driver_ring", dataOnly: true },
        );
        testResult = { target, tokensTried: tokens.length, results };
      } else {
        const results = await sendPushToTokens(
          tokens,
          target === "admin" ? "TEST: New Booking" : "TEST: Booking Confirm Ho Gayi!",
          "Ye test notification hai.",
          { type: target === "admin" ? "new_booking" : "driver_assigned", bookingId: "TEST" },
        );
        testResult = { target, tokensTried: tokens.length, results };
      }
    }

    return NextResponse.json({ counts, tokens: summary, testResult });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
