import { adminHeaders } from "@/lib/admin-auth";

// Drivers live in the Drivers sheet now (see src/lib/sheets.ts). Listing and
// toggling availability are admin-only actions — see src/app/api/drivers/**.
export type Driver = {
  id: string;
  name: string;
  phone: string;
  vehicleNo: string;
  vehicleType: string; // vehicle id from vehicles.ts
  available: boolean; // manual on-duty switch
};

// Throws on failure (instead of silently returning []) so the caller can
// show *why* the list is empty — a real empty list looks identical to a
// swallowed error otherwise.
export async function listDrivers(): Promise<Driver[]> {
  const res = await fetch("/api/drivers", { headers: adminHeaders() });
  const raw = await res.text();
  let data: { error?: string; drivers?: Driver[] } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw ? raw.slice(0, 200) : `Server error (${res.status})` };
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Server error (${res.status})`);
  }
  return data.drivers ?? [];
}

export type NewDriverInput = {
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNo: string;
};

export async function createDriver(
  input: NewDriverInput,
): Promise<{ driver: Driver | null; error?: string; errors?: Record<string, string> }> {
  const res = await fetch("/api/drivers", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify(input),
  });
  // Read the body as text first — a server crash (e.g. a bad deploy, a
  // timeout, or Apps Script/Cloudflare returning an HTML error page) can
  // mean the response isn't JSON at all. Parsing straight to JSON in that
  // case throws, and since nothing here catches it, it used to blank the
  // whole page. Falling back to the raw text keeps the error visible in
  // the form instead.
  const raw = await res.text();
  let data: { error?: string; errors?: Record<string, string>; driver?: Driver } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw ? raw.slice(0, 200) : `Server error (${res.status})` };
  }
  if (!res.ok) {
    return { driver: null, error: data.error ?? `Server error (${res.status})`, errors: data.errors };
  }
  return { driver: data.driver ?? null };
}

export async function setDriverAvailability(id: string, available: boolean): Promise<Driver | null> {
  const res = await fetch(`/api/drivers/${encodeURIComponent(id)}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ available }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.driver as Driver | undefined) ?? null;
}
