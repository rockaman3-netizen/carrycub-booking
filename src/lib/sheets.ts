// SERVER ONLY. Never import this file from a "use client" component.
// Data source: Firebase Firestore. Collections: bookings, drivers, locations.
// (File name sheets.ts is kept so other imports don't change.)

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, query, where, runTransaction,
} from "firebase/firestore";
import type { StatusId } from "@/lib/status";

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: "AIzaSyDG2BB4ZBKJIcsJWqqt_QFB8cZ5dp8RZbU",
      authDomain: "carrycub-truck-booking.firebaseapp.com",
      projectId: "carrycub-truck-booking",
      storageBucket: "carrycub-truck-booking.firebasestorage.app",
      messagingSenderId: "1074926867268",
      appId: "1:1074926867268:web:78324dd7403039dc037d11",
    });
const db = getFirestore(app);

const BOOKINGS = "bookings";
const DRIVERS = "drivers";
const LOCATIONS = "locations";

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

// ---- helpers ----

function toBooking(id: string, data: Record<string, unknown>): SheetBooking {
  return { ...(data as Omit<SheetBooking, "id">), id };
}

function toDoc(b: SheetBooking) {
  const copy = { ...b };
  delete copy.driverLocation; // location lives in its own collection
  return copy;
}

function newestFirst(a: SheetBooking, b: SheetBooking): number {
  return a.createdAt < b.createdAt ? 1 : -1;
}

// ---- Bookings ----

export async function listBookings(): Promise<SheetBooking[]> {
  const [snap, locations] = await Promise.all([
    getDocs(collection(db, BOOKINGS)),
    listLocationsMap(),
  ]);
  return snap.docs
    .map((d) => {
      const b = toBooking(d.id, d.data());
      b.driverLocation = locations.get(b.id) ?? null;
      return b;
    })
    .sort(newestFirst);
}

export async function listBookingsForDriver(driverId: string): Promise<SheetBooking[]> {
  const snap = await getDocs(query(collection(db, BOOKINGS), where("driverId", "==", driverId)));
  return snap.docs.map((d) => toBooking(d.id, d.data())).sort(newestFirst);
}

export async function getBooking(id: string): Promise<SheetBooking | null> {
  const [snap, location] = await Promise.all([getDoc(doc(db, BOOKINGS, id)), getLocation(id)]);
  if (!snap.exists()) return null;
  const b = toBooking(snap.id, snap.data());
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
  const ref = doc(db, BOOKINGS, input.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error("DUPLICATE_BOOKING_ID");
    tx.set(ref, toDoc(booking));
  });
  return booking;
}

// Read the live doc, apply the change, write back, all in one transaction
// (so two people can't overwrite each other's change).
async function mutateBooking(
  id: string,
  mutate: (current: SheetBooking) => Partial<SheetBooking> | { error: string },
): Promise<Result> {
  const ref = doc(db, BOOKINGS, id);
  const outcome = await runTransaction<Result>(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { booking: null, error: "Booking not found" };
    const current = toBooking(snap.id, snap.data());
    const patch = mutate(current);
    if ("error" in patch) return { booking: current, error: patch.error };
    const updated: SheetBooking = { ...current, ...patch, updatedAt: new Date().toISOString() };
    tx.set(ref, toDoc(updated));
    return { booking: updated };
  });
  if (outcome.booking && !outcome.error) outcome.booking.driverLocation = await getLocation(id);
  return outcome;
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
  const snap = await getDocs(collection(db, DRIVERS));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<SheetDriver, "id">), id: d.id }));
}

export async function createDriver(driver: SheetDriver): Promise<SheetDriver> {
  const ref = doc(db, DRIVERS, driver.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error("DUPLICATE_DRIVER_ID");
    tx.set(ref, driver);
  });
  return driver;
}

export async function getDriver(id: string): Promise<SheetDriver | null> {
  const snap = await getDoc(doc(db, DRIVERS, id));
  return snap.exists() ? { ...(snap.data() as Omit<SheetDriver, "id">), id: snap.id } : null;
}

export async function getDriverByPhone(phone: string): Promise<SheetDriver | null> {
  const digits = phone.replace(/\D/g, "").slice(-10); // last 10 digits, ignore spaces/+91/dashes
  if (!digits) return null;
  const drivers = await listDrivers();
  return drivers.find((d) => d.phone.replace(/\D/g, "").slice(-10) === digits) ?? null;
}

export async function setDriverAvailability(id: string, available: boolean): Promise<SheetDriver | null> {
  const ref = doc(db, DRIVERS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  await updateDoc(ref, { available });
  return { ...(snap.data() as Omit<SheetDriver, "id">), id: snap.id, available };
}

// ---- Locations (one doc per booking) ----

async function listLocationsMap(): Promise<Map<string, Loc>> {
  const snap = await getDocs(collection(db, LOCATIONS));
  const map = new Map<string, Loc>();
  for (const d of snap.docs) {
    const v = d.data();
    map.set(d.id, { lat: v.lat, lng: v.lng, updatedAt: v.updatedAt });
  }
  return map;
}

async function getLocation(bookingId: string): Promise<Loc | null> {
  const snap = await getDoc(doc(db, LOCATIONS, bookingId));
  if (!snap.exists()) return null;
  const v = snap.data();
  return { lat: v.lat, lng: v.lng, updatedAt: v.updatedAt };
}

export async function upsertLocation(
  bookingId: string,
  driverId: string,
  lat: number,
  lng: number,
): Promise<Loc> {
  const updatedAt = new Date().toISOString();
  await setDoc(doc(db, LOCATIONS, bookingId), { bookingId, driverId, lat, lng, updatedAt });
  return { lat, lng, updatedAt };
}

async function clearLocation(bookingId: string): Promise<void> {
  await deleteDoc(doc(db, LOCATIONS, bookingId));
}
