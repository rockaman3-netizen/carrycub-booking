"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { vehicleById } from "@/lib/vehicles";
import { fmtTime } from "@/lib/format";
import { ALL_STATUSES, canCancel, type StatusId } from "@/lib/status";
import { assignDriver, changeStatus, getBooking, type StoredBooking } from "@/lib/store";
import { listDrivers, type Driver } from "@/lib/drivers";
import { usePolling } from "@/lib/poll";
import StatusPill from "@/components/admin/StatusPill";
import { toIndianE164 } from "@/components/ContactActions";

// Leaflet touches window/document, so it must never run during SSR.
const TrackingMap = dynamic(() => import("@/components/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="map-placeholder h-56 animate-pulse rounded-2xl border border-gray-200" />
  ),
});

export default function BookingDetail({ id }: { id: string }) {
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverPick, setDriverPick] = useState("");
  const [error, setError] = useState("");

  // Polls so this stays in sync while a driver acts on the same booking
  // elsewhere (their phone), or another admin makes a change.
  usePolling(async () => setBooking(await getBooking(id)), [id]);
  usePolling(async () => setDrivers(await listDrivers()), [], 8000);

  if (booking === undefined) {
    return <p className="px-5 py-12 text-center text-sm text-gray-400">Loading...</p>;
  }
  if (booking === null) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-gray-500">Booking not found.</p>
        <Link href="/admin" className="mt-4 inline-block text-sm font-medium text-brand-dark">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const vehicle = vehicleById(booking.vehicleId);
  // Driver name/phone/vehicle are denormalized onto the booking row at
  // assign time, so the "currently assigned" display needs no lookup.
  const currentDriver = booking.driverId
    ? {
        name: booking.driverName ?? "",
        phone: booking.driverPhone ?? "",
        vehicleNo: booking.driverVehicleNo ?? "",
      }
    : null;
  const location = booking.driverLocation;
  const isTripLive = booking.status !== "delivered" && booking.status !== "cancelled";
  // Drivers of the right vehicle type, currently available (or already assigned to this booking)
  const eligible = drivers.filter(
    (d) => d.vehicleType === booking.vehicleId && (d.available || d.id === booking.driverId),
  );

  async function handleAssign(d: Driver) {
    const updated = await assignDriver(booking!.id, d.id);
    if (updated) {
      setBooking(updated);
      setDriverPick("");
      setError("");
    }
  }

  async function handleStatus(s: StatusId) {
    const { booking: updated, error: err } = await changeStatus(booking!.id, s);
    if (err) {
      setError(err);
      return;
    }
    if (updated) {
      setBooking(updated);
      setError("");
    }
  }

  return (
    <div className="px-5 py-6">
      <Link href="/admin" className="text-xs font-medium text-gray-500">
        ← Dashboard
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide text-navy">{booking.id}</h1>
        <StatusPill status={booking.status} />
      </div>
      <p className="text-xs text-gray-400">Booked {fmtTime(booking.createdAt)}</p>

      {/* Trip */}
      <div className="mt-5 space-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Pickup</span>
          <span className="text-right font-medium">{booking.pickup}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Drop</span>
          <span className="text-right font-medium">{booking.drop}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Vehicle</span>
          <span className="text-right font-medium">
            {vehicle ? `${vehicle.emoji} ${vehicle.name}` : booking.vehicleId}
          </span>
        </div>
        {booking.notes && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Notes</span>
            <span className="text-right font-medium">{booking.notes}</span>
          </div>
        )}
        {booking.estimatedFare != null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Estimated fare</span>
            <span className="text-right font-medium">
              ₹{booking.estimatedFare}
              {booking.distanceKm != null && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (~{booking.distanceKm} km, test estimate)
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Customer</span>
          <span className="text-right font-medium">{booking.name}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Mobile</span>
          <a
            href={`tel:${toIndianE164(booking.mobile) ?? `+91${booking.mobile}`}`}
            className="text-right font-medium text-brand-dark"
          >
            +91 {booking.mobile}
          </a>
        </div>
      </div>

      {/* Driver assignment */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-navy">Driver</h2>
        {currentDriver ? (
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl">
              🧑
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy">{currentDriver.name}</p>
              <p className="text-xs text-gray-500">
                {currentDriver.vehicleNo} · {currentDriver.phone}
              </p>
            </div>
            {toIndianE164(currentDriver.phone) && (
              <a
                href={`tel:${toIndianE164(currentDriver.phone)}`}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-navy"
              >
                Call
              </a>
            )}
          </div>
        ) : (
          <>
            {eligible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-sm text-gray-400">
                No available {vehicle?.name ?? "matching"} drivers right now.{" "}
                <Link href="/admin/drivers" className="font-medium text-brand-dark">
                  Manage drivers
                </Link>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {eligible.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDriverPick(d.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
                      driverPick === d.id ? "border-brand bg-orange-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">
                      🧑
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-navy">{d.name}</span>
                      <span className="block text-xs text-gray-500">{d.vehicleNo}</span>
                    </span>
                    <span
                      className={`h-5 w-5 rounded-full border-2 ${
                        driverPick === d.id ? "border-brand bg-brand" : "border-gray-300"
                      }`}
                    />
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!driverPick}
                  onClick={() => {
                    const d = drivers.find((x) => x.id === driverPick);
                    if (d) handleAssign(d);
                  }}
                  className="mt-1 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-30"
                >
                  Assign driver
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Live map: pickup, drop, and the driver's real GPS position */}
      <div className="mt-4">
        <TrackingMap pickup={booking.pickupLoc} drop={booking.dropLoc} driver={location} />
      </div>

      {/* Live driver location (real GPS, shared by the driver's device) */}
      {isTripLive && currentDriver && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
          {location ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-navy">📍 Live location</span>
                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-dark"
                >
                  Open in Maps
                </a>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)} · updated {fmtTime(location.updatedAt)}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">
              Waiting for {currentDriver.name.split(" ")[0]}&apos;s device to share a live location…
            </p>
          )}
        </div>
      )}

      {/* Status change */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-navy">Change status</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleStatus(s.id)}
              disabled={s.id === booking.status}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                s.id === booking.status
                  ? "border-navy bg-navy text-white"
                  : "border-gray-200 bg-white text-gray-600"
              } disabled:opacity-100`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {canCancel(booking.status) && (
          <p className="mt-2 text-xs text-gray-400">
            Tip: use Cancelled to cancel from the admin side too.
          </p>
        )}
      </div>
    </div>
  );
}
