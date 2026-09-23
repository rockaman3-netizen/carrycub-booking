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

export async function listDrivers(): Promise<Driver[]> {
  const res = await fetch("/api/drivers", { headers: adminHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.drivers as Driver[] | undefined) ?? [];
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
