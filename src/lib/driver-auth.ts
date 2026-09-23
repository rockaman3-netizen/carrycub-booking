// TEST ONLY: not real authentication. Driver "logs in" with their phone
// number, matched server-side against the Drivers sheet (see
// src/app/api/driver-login). The full driver record is cached in
// sessionStorage at login time so currentDriver()/currentDriverId() can stay
// synchronous — everything that reads the session (DriverGuard, page
// headers, etc.) doesn't need to become async just for this.
import type { Driver } from "@/lib/drivers";

const SESSION_KEY = "carrycub:driver-session";

export async function driverLogin(phone: string): Promise<Driver | null> {
  const res = await fetch("/api/driver-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: phone.trim() }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const driver = (data.driver as Driver | undefined) ?? null;
  if (driver) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(driver));
    } catch {
      /* ignore */
    }
  }
  return driver;
}

export function currentDriverId(): string | null {
  return currentDriver()?.id ?? null;
}

export function currentDriver(): Driver | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Driver) : null;
  } catch {
    return null;
  }
}

export function driverLogout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
