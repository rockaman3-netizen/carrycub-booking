// SERVER ONLY. Never import this file from a "use client" component.
// Data source: Firebase Firestore via REST API + service account
// (works on Cloudflare Workers and on the free Spark plan).
// Collections: bookings, drivers, locations.
// (File name sheets.ts is kept so other imports don't change.)

import { SignJWT, importPKCS8 } from "jose";
import type { StatusId } from "@/lib/status";

const BOOKINGS = "bookings";
const DRIVERS = "drivers";
const LOCATIONS = "locations";

const MAX_BOOKINGS = 200; // listBookings returns the newest N (keeps Firestore reads low)
const MAX_RETRIES = 5; // retries when two people edit the same booking at once

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

type Loc = { lat: number; lng: number; updatedAt: string };
type Result = { booking: SheetBooking | null; error?: string };

// ---- Firestore REST plumbing ----

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const projectId = () => process.env.FIREBASE_PROJECT_ID || "carrycub-truck-booking";
const docsUrl = () =>
  `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents`;
const docName = (col: string, id: string) =>
  `projects/${projectId()}/databases/(default)/documents/${col}/${id}`;

let cachedToken: { value: string; exp: number } | null = null;

// Accepts the key pasted in almost any form: whole service-account JSON,
// the key with or without the BEGIN/END lines, with quotes, with a trailing
// comma, or with literal "\n" text.
function cleanPrivateKey(): string {
  let raw = env("FIREBASE_PRIVATE_KEY").trim();
  if (raw.startsWith("{")) {
    try {
      raw = JSON.parse(raw).private_key || raw;
    } catch {}
  }
  raw = raw.replace(/\\n/g, "\n");

  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  const bi = raw.indexOf(begin);
  if (bi >= 0) raw = raw.slice(bi + begin.length);
  const ei = raw.indexOf(end);
  if (ei >= 0) raw = raw.slice(0, ei);

  const body = raw.replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 1000) {
    throw new Error(`FIREBASE_PRIVATE_KEY incomplete (only ${body.length} chars found)`);
  }
  if (!body.startsWith("MII")) {
    throw new Error(`FIREBASE_PRIVATE_KEY does not look like a key (starts with "${body.slice(0, 4)}")`);
  }
  const lines = (body.match(/.{1,64}/g) as string[]).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const email = env("FIREBASE_CLIENT_EMAIL").trim();
  const key = await importPKCS8(cleanPrivateKey(), "RS256");

  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Firebase auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

type Reply = { status: number; ok: boolean; body: any };

async function call(method: string, url: string, body?: unknown): Promise<Reply> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

function fail(what: string, r: Reply): never {
  throw new Error(`Firestore ${what} failed (${r.status}): ${JSON.stringify(r.body)}`);
}

// ---- Value encoding (JS <-> Firestore REST format) ----

type FsValue = Record<string, any>;
type RawDoc = { name: string; fields?: Record<string, FsValue>; updateTime?: string };

function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") {
    return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  }
  return { nullValue: null };
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = encodeValue(v);
  }
  return out;
}

function decodeValue(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

const decodeDoc = (d: RawDoc) => decodeFields(d.fields ?? {});
const idOf = (d: RawDoc) => d.name.split("/").pop() as string;

// ---- Firestore operations ----

async function getRaw(col: string, id: string): Promise<RawDoc | null> {
  const r = await call("GET", `${docsUrl()}/${col}/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) fail(`read ${col}/${id}`, r);
  return r.body as RawDoc;
}

async function listAll(col: string): Promise<RawDoc[]> {
  const out: RawDoc[] = [];
  let pageToken = "";
  do {
    const suffix = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const r = await call("GET", `${docsUrl()}/${col}?pageSize=300${suffix}`);
    if (!r.ok) fail(`list ${col}`, r);
    out.push(...((r.body?.documents ?? []) as RawDoc[]));
    pageToken = r.body?.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function runQuery(structuredQuery: Record<string, unknown>): Promise<RawDoc[]> {
  const r = await call("POST", `${docsUrl()}:runQuery`, { structuredQuery });
  if (!r.ok) fail("query", r);
  return (r.body as { document?: RawDoc }[])
    .filter((x) => x.document)
    .map((x) => x.document as RawDoc);
}

// Returns false if a doc with this id already exists.
async function createRaw(col: string, id: string, data: Record<string, unknown>): Promise<boolean> {
  const r = await call("POST", `${docsUrl()}/${col}?documentId=${encodeURIComponent(id)}`, {
    fields: encodeFields(data),
  });
  if (r.status === 409) return false;
  if (!r.ok) fail(`create ${col}/${id}`, r);
  return true;
}

// Overwrite a doc, but only if nobody changed it since we read it (updateTime check).
// Returns false when someone else changed it first, so the caller can retry.
async function commitUpdate(
  col: string,
  id: string,
  data: Record<string, unknown>,
  updateTime: string | undefined,
): Promise<boolean> {
  const r = await call("POST", `${docsUrl()}:commit`, {
    writes: [
      {
        update: { name: docName(col, id), fields: encodeFields(data) },
        currentDocument: { updateTime },
      },
    ],
  });
  if (r.ok) return true;
  const conflict =
    r.status === 409 || (r.status === 400 && r.body?.error?.status === "FAILED_PRECONDITION");
  if (conflict) return false;
  fail(`update ${col}/${id}`, r);
}

// ---- helpers ----

function toBooking(id: string, data: Record<string, unknown>): SheetBooking {
  return { ...(data as Omit<SheetBooking, "id">), id };
}

function toDoc(b: SheetBooking): Record<string, unknown> {
  const copy = { ...b };
  delete copy.driverLocation; // location lives in its own collection
  return copy;
}

function toDriver(d: RawDoc): SheetDriver {
  return { ...(decodeDoc(d) as Omit<SheetDriver, "id">), id: idOf(d) };
}

// ---- Bookings ----

export async function listBookings(): Promise<SheetBooking[]> {
  const [docs, locations] = await Promise.all([
    runQuery({
      from: [{ collectionId: BOOKINGS }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit: MAX_BOOKINGS,
    }),
    listLocationsMap(),
  ]);
  return docs.map((d) => {
    const b = toBooking(idOf(d), decodeDoc(d));
    b.driverLocation = locations.get(b.id) ?? null;
    return b;
  });
}

export async function listBookingsForDriver(driverId: string): Promise<SheetBooking[]> {
  const docs = await runQuery({
    from: [{ collectionId: BOOKINGS }],
    where: {
      fieldFilter: {
        field: { fieldPath: "driverId" },
        op: "EQUAL",
        value: { stringValue: driverId },
      },
    },
  });
  return docs
    .map((d) => toBooking(idOf(d), decodeDoc(d)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getBooking(id: string): Promise<SheetBooking | null> {
  const [raw, location] = await Promise.all([getRaw(BOOKINGS, id), getLocation(id)]);
  if (!raw) return null;
  const b = toBooking(id, decodeDoc(raw));
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
  const created = await createRaw(BOOKINGS, input.id, toDoc(booking));
  if (!created) throw new Error("DUPLICATE_BOOKING_ID");
  return booking;
}

// Read the live doc, apply the change, write back only if nobody else changed it
// in between. If they did, read again and retry (so two people can't overwrite
// each other's change).
async function mutateBooking(
  id: string,
  mutate: (current: SheetBooking) => Partial<SheetBooking> | { error: string },
): Promise<Result> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = await getRaw(BOOKINGS, id);
    if (!raw) return { booking: null, error: "Booking not found" };
    const current = toBooking(id, decodeDoc(raw));
    const patch = mutate(current);
    if ("error" in patch) return { booking: current, error: patch.error };
    const updated: SheetBooking = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const saved = await commitUpdate(BOOKINGS, id, toDoc(updated), raw.updateTime);
    if (saved) {
      updated.driverLocation = await getLocation(id);
      return { booking: updated };
    }
  }
  return { booking: null, error: "Booking is busy, please try again" };
}

export async function assignDriver(bookingId: string, driver: SheetDriver): Promise<Result> {
  const [result] = await Promise.all([
    mutateBooking(bookingId, () => ({
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverVehicleNo: driver.vehicleNo,
      driverVehicleType: driver.vehicleType,
      status: "assigned" as StatusId,
    })),
    clearLocation(bookingId),
  ]);
  if (result.booking) result.booking.driverLocation = null;
  return result;
}

const NEEDS_DRIVER: StatusId[] = ["assigned", "accepted", "arriving", "arrived", "started", "delivered"];

export async function adminChangeStatus(bookingId: string, status: StatusId): Promise<Result> {
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

export async function customerCancel(bookingId: string): Promise<Result> {
  const result = await mutateBooking(bookingId, (current) => {
    if (current.status === "delivered" || current.status === "cancelled") {
      return { error: "This booking can no longer be cancelled" };
    }
    return { status: "cancelled" as StatusId };
  });
  if (result.booking) await clearLocation(bookingId);
  return result;
}

export async function driverAccept(bookingId: string, driverId: string): Promise<Result> {
  return mutateBooking(bookingId, (current) => {
    if (current.driverId !== driverId) return { error: "This booking isn't assigned to you" };
    if (current.status !== "assigned") return { error: "Booking already accepted or moved on" };
    return { status: "accepted" as StatusId };
  });
}

export async function driverReject(bookingId: string, driverId: string): Promise<Result> {
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
): Promise<Result> {
  const result = await mutateBooking(bookingId, (current) => {
    if (current.driverId !== driverId) return { error: "This booking isn't assigned to you" };
    if (expectedNext !== status) return { error: "Statuses must be updated in order" };
    return { status };
  });
  if (result.booking && status === "delivered") await clearLocation(bookingId);
  return result;
}

// ---- Drivers ----

export async function listDrivers(): Promise<SheetDriver[]> {
  const docs = await listAll(DRIVERS);
  return docs.map(toDriver);
}

export async function createDriver(driver: SheetDriver): Promise<SheetDriver> {
  const created = await createRaw(DRIVERS, driver.id, { ...driver });
  if (!created) throw new Error("DUPLICATE_DRIVER_ID");
  return driver;
}

export async function getDriver(id: string): Promise<SheetDriver | null> {
  const raw = await getRaw(DRIVERS, id);
  return raw ? toDriver(raw) : null;
}

export async function getDriverByPhone(phone: string): Promise<SheetDriver | null> {
  const digits = phone.replace(/\D/g, "").slice(-10); // last 10 digits, ignore spaces/+91/dashes
  if (!digits) return null;
  const drivers = await listDrivers();
  return drivers.find((d) => d.phone.replace(/\D/g, "").slice(-10) === digits) ?? null;
}

export async function setDriverAvailability(id: string, available: boolean): Promise<SheetDriver | null> {
  const raw = await getRaw(DRIVERS, id);
  if (!raw) return null;
  const r = await call(
    "PATCH",
    `${docsUrl()}/${DRIVERS}/${encodeURIComponent(id)}?updateMask.fieldPaths=available`,
    { fields: { available: { booleanValue: available } } },
  );
  if (!r.ok) fail(`update ${DRIVERS}/${id}`, r);
  return { ...toDriver(raw), available };
}

// ---- Locations (one doc per booking) ----

function toLoc(d: RawDoc): Loc {
  const v = decodeDoc(d);
  return { lat: v.lat as number, lng: v.lng as number, updatedAt: v.updatedAt as string };
}

async function listLocationsMap(): Promise<Map<string, Loc>> {
  const docs = await listAll(LOCATIONS);
  const map = new Map<string, Loc>();
  for (const d of docs) map.set(idOf(d), toLoc(d));
  return map;
}

async function getLocation(bookingId: string): Promise<Loc | null> {
  const raw = await getRaw(LOCATIONS, bookingId);
  return raw ? toLoc(raw) : null;
}

export async function upsertLocation(
  bookingId: string,
  driverId: string,
  lat: number,
  lng: number,
): Promise<Loc> {
  const updatedAt = new Date().toISOString();
  const r = await call("PATCH", `${docsUrl()}/${LOCATIONS}/${encodeURIComponent(bookingId)}`, {
    fields: encodeFields({ bookingId, driverId, lat, lng, updatedAt }),
  });
  if (!r.ok) fail(`write ${LOCATIONS}/${bookingId}`, r);
  return { lat, lng, updatedAt };
}

async function clearLocation(bookingId: string): Promise<void> {
  const r = await call("DELETE", `${docsUrl()}/${LOCATIONS}/${encodeURIComponent(bookingId)}`);
  if (!r.ok && r.status !== 404) fail(`delete ${LOCATIONS}/${bookingId}`, r);
}
