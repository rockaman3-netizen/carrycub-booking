// SERVER ONLY. Never import this file from a "use client" component.
// Data source: Google Apps Script Web App (see APPS_SCRIPT_SETUP.md).
// Tabs: Bookings, Drivers, LocationUpdates.

import type { StatusId } from "@/lib/status";

const BOOKINGS_SHEET = "Bookings";
const DRIVERS_SHEET = "Drivers";
const LOCATIONS_SHEET = "LocationUpdates";

const SHEET_STATUS_LABELS: Partial<Record<StatusId, string>> = {
  accepted: "Driver Accepted",
  arriving: "Arriving at Pickup",
  arrived: "Arrived at Pickup",
  started: "Delivery Started",
  delivered: "Delivered",
};

// Column order must match the sheet's header row (A onward).
const BOOKING_COLUMNS = [
  "id",
  "createdAt",
  "updatedAt",
  "status",
  "pickup",
  "drop",
  "pickupLat",
  "pickupLng",
  "dropLat",
  "dropLng",
  "vehicleId",
  "name",
  "mobile",
  "notes",
  "distanceKm",
  "estimatedFare",
  "driverId",
  "driverName",
  "driverPhone",
  "driverVehicleNo",
  "driverVehicleType",
] as const;

const DRIVER_COLUMNS = ["id", "name", "phone", "vehicleNo", "vehicleType", "available"] as const;

const LOCATION_COLUMNS = ["bookingId", "driverId", "lat", "lng", "updatedAt"] as const;

export type SheetBooking = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: StatusId;
  pickup: string;
  drop: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  vehicleId: string;
  name: string;
  mobile: string;
  notes: string;
  distanceKm: number | null;
  estimatedFare: number | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicleNo: string | null;
  driverVehicleType: string | null;
  driverLocation?: { lat: number; lng: number; updatedAt: string } | null;
};

export type SheetDriver = {
  id: string;
  name: string;
  phone: string;
  vehicleNo: string;
  vehicleType: string;
  available: boolean;
};

type Cell = string | number | null;

// ---- Apps Script client ----

const SCRIPT_TIMEOUT_MS = 15000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Google Sheets isn't configured — see APPS_SCRIPT_SETUP.md for the required environment variables.`,
    );
  }
  return value;
}

function getScriptUrl(): string {
  return requiredEnv("APPS_SCRIPT_URL");
}

function getScriptSecret(): string {
  return requiredEnv("APPS_SCRIPT_SECRET");
}

type ScriptRequest =
  | { action: "getRows"; sheet: string }
  | { action: "getRowById"; sheet: string; id: string }
  | { action: "appendRow"; sheet: string; row: Cell[] }
  | { action: "updateById"; sheet: string; id: string; row: Cell[] }
  | { action: "upsertById"; sheet: string; id: string; row: Cell[] }
  | { action: "deleteById"; sheet: string; id: string };

// Safe to run twice (same result), so one retry on a hiccup is fine.
// appendRow is NOT in this list: retrying it could add a duplicate row.
const RETRYABLE = new Set(["getRows", "getRowById", "updateById", "upsertById", "deleteById"]);

async function callScriptOnce<T>(body: ScriptRequest): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRIPT_TIMEOUT_MS);
  try {
    const res = await fetch(getScriptUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, secret: getScriptSecret() }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Apps Script request failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(`Apps Script error: ${data.error}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

async function callScript<T>(body: ScriptRequest): Promise<T> {
  try {
    return await callScriptOnce<T>(body);
  } catch (err) {
    if (!RETRYABLE.has(body.action)) throw err;
    return callScriptOnce<T>(body);
  }
}

// ---- Generic row helpers ----

function clean(row: Cell[]): Cell[] {
  return row.map((v) => (v === null || v === undefined ? "" : v));
}

async function getRows(sheetName: string): Promise<string[][]> {
  const data = await callScript<{ values?: unknown[][] }>({ action: "getRows", sheet: sheetName });
  // Google Sheets returns real numbers/booleans for numeric-looking cells
  // (e.g. mobile 8084750977, available TRUE). Convert every cell to a string.
  return (data.values ?? []).map((row) => row.map((v) => (v === null || v === undefined ? "" : String(v))));
}

// One row, looked up by its ID (column A) inside the script. Always live.
async function getRowById(sheetName: string, id: string): Promise<string[] | null> {
  const data = await callScript<{ row?: unknown[] | null }>({ action: "getRowById", sheet: sheetName, id });
  if (!data.row) return null;
  return data.row.map((v) => (v === null || v === undefined ? "" : String(v)));
}

async function appendRow(sheetName: string, row: Cell[]): Promise<void> {
  await callScript({ action: "appendRow", sheet: sheetName, row: clean(row) });
}

async function updateRowById(sheetName: string, id: string, row: Cell[]): Promise<void> {
  await callScript({ action: "updateById", sheet: sheetName, id, row: clean(row) });
}

async function upsertRowById(sheetName: string, id: string, row: Cell[]): Promise<void> {
  await callScript({ action: "upsertById", sheet: sheetName, id, row: clean(row) });
}

async function deleteRowById(sheetName: string, id: string): Promise<void> {
  await callScript({ action: "deleteById", sheet: sheetName, id });
}

// ---- Bookings ----

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sheetStatusToId(raw: string): StatusId {
  const v = raw.trim();
  if (!v) return "searching";
  for (const [id, label] of Object.entries(SHEET_STATUS_LABELS)) {
    if (label && v.toLowerCase() === label.toLowerCase()) return id as StatusId;
  }
  return v as StatusId;
}

function rowToBooking(row: string[]): SheetBooking {
  const get = (col: (typeof BOOKING_COLUMNS)[number]) => row[BOOKING_COLUMNS.indexOf(col)] ?? "";
  return {
    id: get("id"),
    createdAt: get("createdAt"),
    updatedAt: get("updatedAt"),
    status: sheetStatusToId(get("status")),
    pickup: get("pickup"),
    drop: get("drop"),
    pickupLat: num(get("pickupLat")),
    pickupLng: num(get("pickupLng")),
    dropLat: num(get("dropLat")),
    dropLng: num(get("dropLng")),
    vehicleId: get("vehicleId"),
    name: get("name"),
    mobile: get("mobile"),
    notes: get("notes"),
    distanceKm: num(get("distanceKm")),
    estimatedFare: num(get("estimatedFare")),
    driverId: get("driverId") || null,
    driverName: get("driverName") || null,
    driverPhone: get("driverPhone") || null,
    driverVehicleNo: get("driverVehicleNo") || null,
    driverVehicleType: get("driverVehicleType") || null,
  };
}

function bookingToRow(b: SheetBooking): Cell[] {
  return BOOKING_COLUMNS.map((col) => {
    if (col === "status") return SHEET_STATUS_LABELS[b.status] ?? b.status;
    const v = b[col as keyof SheetBooking];
    return v === undefined ? null : (v as Cell);
  });
}

function newestFirst(a: SheetBooking, b: SheetBooking): number {
  return a.createdAt < b.createdAt ? 1 : -1;
}

// Admin list: bookings + live driver locations.
export async function listBookings(): Promise<SheetBooking[]> {
  const [rows, locations] = await Promise.all([getRows(BOOKINGS_SHEET), listLocationsMap()]);
  return rows
    .filter((r) => r[0])
    .map((r) => {
      const b = rowToBooking(r);
      b.driverLocation = locations.get(b.id) ?? null;
      return b;
    })
    .sort(newestFirst);
}

// Driver list: only the Bookings sheet (no locations needed here).
export async function listBookingsForDriver(driverId: string): Promise<SheetBooking[]> {
  const rows = await getRows(BOOKINGS_SHEET);
  const driverCol = BOOKING_COLUMNS.indexOf("driverId");
  return rows
    .filter((r) => r[0] && r[driverCol] === driverId)
    .map((r) => rowToBooking(r))
    .sort(newestFirst);
}

export async function getBooking(id: string): Promise<SheetBooking | null> {
  // Booking row and driver location fetched at the same time.
  const [row, location] = await Promise.all([getRowById(BOOKINGS_SHEET, id), getLocation(id)]);
  if (!row) return null;
  const b = rowToBooking(row);
  b.driverLocation = location;
  return b;
}

export async function createBooking(input: {
  id: string;
  createdAt: string;
  pickup: string;
  drop: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  vehicleId: string;
  name: string;
  mobile: string;
  notes: string;
  distanceKm: number | null;
  estimatedFare: number | null;
}): Promise<SheetBooking> {
  // Guard against duplicate booking IDs.
  const existing = await getRowById(BOOKINGS_SHEET, input.id);
  if (existing) {
    throw new Error("DUPLICATE_BOOKING_ID");
  }
  const booking: SheetBooking = {
    ...input,
    updatedAt: input.createdAt,
    status: "searching",
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicleNo: null,
    driverVehicleType: null,
  };
  await appendRow(BOOKINGS_SHEET, bookingToRow(booking));
  return booking;
}

// Read the live row, apply the change, write it back by ID.
async function mutateBooking(
  id: string,
  mutate: (current: SheetBooking) => Partial<SheetBooking> | { error: string },
): Promise<{ booking: SheetBooking | null; error?: string }> {
  const row = await getRowById(BOOKINGS_SHEET, id);
  if (!row) return { booking: null, error: "Booking not found" };
  const current = rowToBooking(row);
  const patch = mutate(current);
  if ("error" in patch) return { booking: current, error: patch.error };
  const updated: SheetBooking = { ...current, ...patch, updatedAt: new Date().toISOString() };
  // Save the row and read the location at the same time.
  const [, location] = await Promise.all([
    updateRowById(BOOKINGS_SHEET, id, bookingToRow(updated)),
    getLocation(id),
  ]);
  updated.driverLocation = location;
  return { booking: updated };
}

export async function assignDriver(
  bookingId: string,
  driver: SheetDriver,
): Promise<{ booking: SheetBooking | null; error?: string }> {
  // Assign and clear any old location at the same time.
  const [result] = await Promise.all([
    mutateBooking(bookingId, () => ({
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverVehicleNo: driver.vehicleNo,
      driverVehicleType: driver.vehicleType,
      status: "assigned",
    })),
    clearLocation(bookingId),
  ]);
  if (result.booking) result.booking.driverLocation = null;
  return result;
}

const NEEDS_DRIVER: StatusId[] = [
  "assigned",
  "accepted",
  "arriving",
  "arrived",
  "started",
  "delivered",
];

export async function adminChangeStatus(
  bookingId: string,
  status: StatusId,
): Promise<{ booking: SheetBooking | null; error?: string }> {
  const result = await mutateBooking(bookingId, (current) => {
    if (NEEDS_DRIVER.includes(status) && !current.driverId) {
      return { error: "Assign a driver first" };
    }
    const clearingDriver = status === "searching";
    return {
      status,
      ...(clearingDriver
        ? { driverId: null, driverName: null, driverPhone: null, driverVehicleNo: null, driverVehicleType: null }
        : {}),
    };
  });
  const finished = status === "delivered" || status === "cancelled";
  if (result.booking && (finished || status === "searching")) await clearLocation(bookingId);
  return result;
}

export async function customerCancel(bookingId: string): Promise<{ booking: SheetBooking | null; error?: string }> {
  const result = await mutateBooking(bookingId, (current) => {
    if (current.status === "delivered" || current.status === "cancelled") {
      return { error: "This booking can no longer be cancelled" };
    }
    return { status: "cancelled" as StatusId };
  });
  if (result.booking) await clearLocation(bookingId);
  return result;
}

export async function driverAccept(
  bookingId: string,
  driverId: string,
): Promise<{ booking: SheetBooking | null; error?: string }> {
  return mutateBooking(bookingId, (current) => {
    if (current.driverId !== driverId) return { error: "This booking isn't assigned to you" };
    if (current.status !== "assigned") return { error: "Booking already accepted or moved on" };
    return { status: "accepted" as StatusId };
  });
}

export async function driverReject(
  bookingId: string,
  driverId: string,
): Promise<{ booking: SheetBooking | null; error?: string }> {
  const result = await mutateBooking(bookingId, (current) => {
    if (current.driverId !== driverId) return { error: "This booking isn't assigned to you" };
    if (current.status !== "assigned") return { error: "Can only reject before accepting" };
    return {
      status: "searching" as StatusId,
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverVehicleNo: null,
      driverVehicleType: null,
    };
  });
  if (result.booking) await clearLocation(bookingId);
  return result;
}

export async function driverAdvance(
  bookingId: string,
  driverId: string,
  status: StatusId,
  expectedNext: StatusId | null,
): Promise<{ booking: SheetBooking | null; error?: string }> {
  const result = await mutateBooking(bookingId, (current) => {
    if (current.driverId !== driverId) return { error: "This booking isn't assigned to you" };
    if (expectedNext !== status) return { error: "Statuses must be updated in order" };
    return { status };
  });
  if (result.booking && status === "delivered") await clearLocation(bookingId);
  return result;
}

// ---- Drivers ----

function rowToDriver(row: string[]): SheetDriver {
  const get = (col: (typeof DRIVER_COLUMNS)[number]) => row[DRIVER_COLUMNS.indexOf(col)] ?? "";
  return {
    id: get("id"),
    name: get("name"),
    phone: get("phone"),
    vehicleNo: get("vehicleNo"),
    vehicleType: get("vehicleType"),
    available: get("available").trim().toUpperCase() === "TRUE",
  };
}

function driverToRow(driver: SheetDriver): Cell[] {
  return DRIVER_COLUMNS.map((col) =>
    col === "available" ? (driver.available ? "TRUE" : "FALSE") : (driver[col as keyof SheetDriver] as Cell),
  );
}

export async function listDrivers(): Promise<SheetDriver[]> {
  const rows = await getRows(DRIVERS_SHEET);
  return rows.filter((r) => r[0]).map((r) => rowToDriver(r));
}

export async function createDriver(driver: SheetDriver): Promise<SheetDriver> {
  const existing = await getRowById(DRIVERS_SHEET, driver.id);
  if (existing) {
    throw new Error("DUPLICATE_DRIVER_ID");
  }
  await appendRow(DRIVERS_SHEET, driverToRow(driver));
  return driver;
}

export async function getDriver(id: string): Promise<SheetDriver | null> {
  const row = await getRowById(DRIVERS_SHEET, id);
  return row ? rowToDriver(row) : null;
}

export async function getDriverByPhone(phone: string): Promise<SheetDriver | null> {
  const digits = phone.replace(/\D/g, "").slice(-10); // last 10 digits, ignore spaces/+91/dashes
  if (!digits) return null;
  const drivers = await listDrivers();
  return drivers.find((d) => d.phone.replace(/\D/g, "").slice(-10) === digits) ?? null;
}

export async function setDriverAvailability(id: string, available: boolean): Promise<SheetDriver | null> {
  const row = await getRowById(DRIVERS_SHEET, id);
  if (!row) return null;
  const driver = { ...rowToDriver(row), available };
  await updateRowById(DRIVERS_SHEET, id, driverToRow(driver));
  return driver;
}

// ---- LocationUpdates (one row per booking, upserted) ----

function rowToLocation(row: string[]): { bookingId: string; lat: number; lng: number; updatedAt: string } {
  const get = (col: (typeof LOCATION_COLUMNS)[number]) => row[LOCATION_COLUMNS.indexOf(col)] ?? "";
  return {
    bookingId: get("bookingId"),
    lat: Number(get("lat")),
    lng: Number(get("lng")),
    updatedAt: get("updatedAt"),
  };
}

async function listLocationsMap(): Promise<Map<string, { lat: number; lng: number; updatedAt: string }>> {
  const rows = await getRows(LOCATIONS_SHEET);
  const map = new Map<string, { lat: number; lng: number; updatedAt: string }>();
  for (const r of rows) {
    if (!r[0]) continue;
    const loc = rowToLocation(r);
    map.set(loc.bookingId, { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt });
  }
  return map;
}

async function getLocation(bookingId: string): Promise<{ lat: number; lng: number; updatedAt: string } | null> {
  const row = await getRowById(LOCATIONS_SHEET, bookingId);
  if (!row) return null;
  const loc = rowToLocation(row);
  return { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt };
}

export async function upsertLocation(
  bookingId: string,
  driverId: string,
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  // One call: the script updates the row if it exists, else adds it.
  await upsertRowById(LOCATIONS_SHEET, bookingId, [bookingId, driverId, lat, lng, updatedAt]);
  return { lat, lng, updatedAt };
}

async function clearLocation(bookingId: string): Promise<void> {
  await deleteRowById(LOCATIONS_SHEET, bookingId);
}
