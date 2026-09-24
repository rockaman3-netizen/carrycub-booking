import { NextRequest, NextResponse } from "next/server";
import { createDriver, listDrivers } from "@/lib/sheets";
import { isAdminRequest } from "@/lib/admin-api-auth";
import { vehicleById } from "@/lib/vehicles";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const drivers = await listDrivers();
    return NextResponse.json({ drivers });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Temporary (server-only) driver ID, e.g. DR-K7QM8P — same no-confusing-chars
// alphabet as generateBookingId() in src/lib/booking.ts.
function generateDriverId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `DR-${suffix}`;
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  // Accept "+91 98765 43210", "098765-43210" etc: keep digits, use the last 10.
  const phone = String(body.phone ?? "").replace(/\D/g, "").slice(-10);
  const vehicleNo = String(body.vehicleNo ?? "").trim();
  const vehicleType = String(body.vehicleType ?? "").trim();

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter driver name";
  else if (name.length > 60) errors.name = "Name is too long";
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = "Enter a valid 10-digit mobile number";
  if (!vehicleById(vehicleType)) errors.vehicleType = "Select a vehicle type";
  if (!vehicleNo) errors.vehicleNo = "Enter vehicle number";
  else if (vehicleNo.length > 20) errors.vehicleNo = "Vehicle number is too long";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Invalid driver", errors }, { status: 400 });
  }

  try {
    const driver = await createDriver({
      id: generateDriverId(),
      name,
      phone,
      vehicleNo,
      vehicleType,
      available: false,
    });
    return NextResponse.json({ driver }, { status: 201 });
  } catch (err) {
    if ((err as Error).message === "DUPLICATE_DRIVER_ID") {
      return NextResponse.json({ error: "Driver ID collision, try again" }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
