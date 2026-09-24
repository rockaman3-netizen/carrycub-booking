"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { VEHICLES, vehicleById } from "@/lib/vehicles";
import {
  FLOW,
  TEST_DRIVER,
  canCancel,
  getStatus,
  type StatusId,
} from "@/lib/status";
import { fmtTime } from "@/lib/format";
import { getBooking, cancelBooking, type StoredBooking } from "@/lib/store";
import { rememberRecentBookingId } from "@/lib/recent-bookings";
import { usePolling } from "@/lib/poll";
import { CallButton, WhatsAppButton } from "@/components/ContactActions";

// Leaflet touches window/document, so it must never run during SSR.
const TrackingMap = dynamic(() => import("@/components/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="map-placeholder h-56 animate-pulse rounded-2xl border border-gray-200" />
  ),
});

export default function TrackingView({ id }: { id: string }) {
  // undefined = still loading, null = not found
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    rememberRecentBookingId(id);
  }, [id]);

  // Polls so a driver's live GPS updates and admin status changes (made on
  // a different device) show up here without a manual refresh.
  usePolling(
    async () => {
      const b = await getBooking(id);
      // A failed poll (network/Apps Script hiccup) comes back as null. Once
      // the booking has loaded, keep showing it instead of flipping to
      // "Booking not found" — the next poll will refresh it.
      setBooking((prev) => b ?? (prev ? prev : null));
    },
    [id],
  );

  if (booking === undefined) {
    return <p className="px-6 py-12 text-center text-sm text-gray-400">Loading...</p>;
  }

  if (booking === null) {
    return (
      <section className="px-6 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">
          🔍
        </div>
        <h2 className="mt-4 text-lg font-bold text-navy">Booking not found</h2>
        <p className="mt-1 text-sm text-gray-500">
          We couldn&apos;t find <span className="font-medium">{id.toUpperCase()}</span> on this
          device. Test bookings are stored only in the browser they were made in.
        </p>
        <Link
          href="/track"
          className="mt-6 block w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white"
        >
          Try another ID
        </Link>
      </section>
    );
  }

  const status: StatusId = booking.status;
  const info = getStatus(status);
  const vehicle = VEHICLES.find((v) => v.id === booking.vehicleId);
  const flowIndex = FLOW.findIndex((s) => s.id === status);
  const isCancelled = status === "cancelled";
  const isDelivered = status === "delivered";
  const isSearching = status === "searching";
  const driverAssigned = !isCancelled && flowIndex >= 1;
  // Driver name/phone/vehicle are denormalized onto the booking row at
  // assign time (see src/lib/sheets.ts), so no separate lookup is needed.
  const driver = booking.driverId
    ? { name: booking.driverName, phone: booking.driverPhone, vehicleNo: booking.driverVehicleNo, vehicleType: booking.driverVehicleType }
    : null;
  const driverVehicle = driver?.vehicleType ? vehicleById(driver.vehicleType) : vehicle;
  const location = booking.driverLocation;
  const isTripLive = !isCancelled && !isDelivered;

  // "Booking Confirmed" is an always-complete step shown ahead of the real
  // status flow (a booking that exists has, by definition, been confirmed).
  const arrivingIndex = FLOW.findIndex((s) => s.id === "arriving");
  // Live map once the driver is moving toward pickup (or later) — or as soon
  // as the driver is sharing a real GPS location, which they can switch on
  // right after accepting.
  const showMap = !isCancelled && (flowIndex >= arrivingIndex || Boolean(location));

  async function handleCancel() {
    const updated = await cancelBooking(booking!.id);
    if (updated) setBooking(updated);
  }

  const tone = isCancelled ? "bg-red-50" : isDelivered ? "bg-green-50" : "bg-orange-50";

  return (
    <section className="px-6 py-8">
      {/* Booking ID */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-500">Booking ID</span>
        <span className="font-semibold tracking-wider text-navy">{booking.id}</span>
      </div>

      {/* Current status */}
      <div className={`mt-5 rounded-3xl px-5 py-8 text-center ${tone}`}>
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          {isSearching && (
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" />
          )}
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            {info.emoji}
          </span>
        </div>
        <h2 className="mt-4 text-lg font-bold text-navy">{info.title}</h2>
        <p className="mt-1 text-sm text-gray-600">{info.message}</p>
      </div>

      {/* Timeline — "Booking Confirmed" is always complete once a booking exists,
          then mirrors the real status flow. Hidden for cancelled bookings. */}
      {!isCancelled && (
        <ol className="mt-6">
          <li className="relative flex items-start gap-4 pb-6">
            <span className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-brand" />
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-white">
              ✓
            </span>
            <span className="pt-0.5 text-sm text-gray-600">Booking Confirmed</span>
          </li>
          {FLOW.map((s, i) => {
            const done = isDelivered || i < flowIndex;
            const current = !isDelivered && i === flowIndex;
            const last = i === FLOW.length - 1;
            return (
              <li key={s.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
                {!last && (
                  <span
                    className={`absolute bottom-0 left-[11px] top-6 w-0.5 ${
                      i < flowIndex ? "bg-brand" : "bg-gray-200"
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    done
                      ? "bg-brand text-white"
                      : current
                        ? "border-2 border-brand bg-white"
                        : "border-2 border-gray-200 bg-white"
                  }`}
                >
                  {done ? "✓" : current ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
                </span>
                <span
                  className={`pt-0.5 text-sm ${
                    current ? "font-semibold text-navy" : done ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Driver — appears as soon as one is assigned */}
      <div className="mt-2">
        <span className="mb-3 block text-sm font-medium text-gray-500">Driver</span>
        {driverAssigned ? (
          <div className="rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                🧑
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">
                  {driver?.name ?? TEST_DRIVER.name}
                </p>
                <p className="text-xs text-gray-500">
                  {driverVehicle?.name} · {driver?.vehicleNo ?? TEST_DRIVER.vehicleNo}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                TEST
              </span>
            </div>
            {/* Contact actions — number itself is never printed, only used as
                the tel:/wa.me target. No driver record (fallback TEST_DRIVER,
                e.g. a deleted driver) means no real number to contact. */}
            {driver?.phone && (
              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                <CallButton phone={driver.phone} label="Call Driver" />
                <WhatsAppButton
                  phone={driver.phone}
                  label="WhatsApp"
                  message={`Hi, this is regarding CarryCub booking ${booking.id}.`}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-sm text-gray-400">
            {isCancelled
              ? "No driver for this booking."
              : "Driver details will appear here once a driver is assigned."}
          </p>
        )}
      </div>

      {/* Live map: only once the driver is actually moving toward pickup */}
      <div className="mt-6">
        {showMap ? (
          <TrackingMap pickup={booking.pickupLoc} drop={booking.dropLoc} driver={location} />
        ) : (
          <div className="map-placeholder flex h-44 items-center justify-center rounded-2xl border border-gray-200">
            <span className="max-w-[210px] rounded-full bg-white/95 px-5 py-3 text-center text-xs text-navy shadow">
              {isCancelled
                ? "Map isn't available for cancelled bookings."
                : "The live map will appear once your driver is on the way to pickup."}
            </span>
          </div>
        )}
      </div>

      {/* Live driver location (real GPS, shared by the driver's device) */}
      {isTripLive && showMap && (
        <div className="mt-4 rounded-2xl border border-gray-200 px-4 py-3 text-sm">
          {location ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-navy">📍 Driver location</span>
                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-brand-dark"
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
              Waiting for the driver&apos;s device to share a live location…
            </p>
          )}
        </div>
      )}

      {/* Trip details */}
      <div className="mt-6 space-y-3 rounded-2xl border border-gray-200 px-4 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-gray-500">Pickup</span>
          <span className="min-w-0 break-words text-right font-medium">{booking.pickup}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-gray-500">Drop</span>
          <span className="min-w-0 break-words text-right font-medium">{booking.drop}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-gray-500">Vehicle</span>
          <span className="min-w-0 break-words text-right font-medium">
            {vehicle ? `${vehicle.name}` : booking.vehicleId}
          </span>
        </div>
        {booking.estimatedFare != null && (
          <div className="flex justify-between gap-4">
            <span className="shrink-0 text-gray-500">Estimated fare</span>
            <span className="min-w-0 break-words text-right font-medium">
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

      {/* Cancel (customer) */}
      {canCancel(status) && (
        <div className="mt-8">
          {!confirmCancel ? (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-2xl border border-red-200 py-3 text-sm font-medium text-red-600 active:bg-red-50"
            >
              Cancel booking
            </button>
          ) : (
            <div className="rounded-2xl bg-red-50 p-4 text-center">
              <p className="text-sm text-red-700">Cancel this booking?</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-xl bg-white py-2.5 text-sm font-medium text-gray-700"
                >
                  Keep booking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCancel();
                    setConfirmCancel(false);
                  }}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(isCancelled || isDelivered) && (
        <Link
          href="/"
          className="mt-8 block w-full rounded-2xl bg-brand py-3.5 text-center text-base font-semibold text-white active:bg-brand-dark"
        >
          New booking
        </Link>
      )}
    </section>
  );
}
