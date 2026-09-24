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
  loading: () => <div className="map-placeholder h-full w-full animate-pulse" />,
});

export default function TrackingView({ id }: { id: string }) {
  // undefined = still loading, null = not found
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    rememberRecentBookingId(id);
  }, [id]);

  // Polls so the driver's live GPS and status changes show up without a refresh.
  usePolling(
    async () => {
      const b = await getBooking(id);
      // A failed poll comes back as null. Once loaded, keep showing the
      // booking instead of flipping to "not found".
      setBooking((prev) => b ?? (prev ? prev : null));
    },
    [id],
  );

  if (booking === undefined) {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-md items-center justify-center bg-[#f3f4f6]">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
  }

  if (booking === null) {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center bg-[#f3f4f6] px-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl">
          🔍
        </div>
        <h2 className="mt-4 text-lg font-bold text-navy">Booking not found</h2>
        <p className="mt-1 text-sm text-gray-500">
          We couldn&apos;t find <span className="font-medium">{id.toUpperCase()}</span>. Please
          check the Booking ID and try again.
        </p>
        <Link
          href="/track"
          className="mt-6 block w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white"
        >
          Try another ID
        </Link>
      </main>
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
  // Driver name/phone/vehicle are stored on the booking row at assign time.
  const driver = booking.driverId
    ? {
        name: booking.driverName,
        phone: booking.driverPhone,
        vehicleNo: booking.driverVehicleNo,
        vehicleType: booking.driverVehicleType,
      }
    : null;
  const driverVehicle = driver?.vehicleType ? vehicleById(driver.vehicleType) : vehicle;
  const location = booking.driverLocation;
  const isTripLive = !isCancelled && !isDelivered;

  async function handleCancel() {
    const updated = await cancelBooking(booking!.id);
    if (updated) setBooking(updated);
  }

  // ---------- Dedicated full-screen "Delivered" experience ----------
  if (isDelivered) {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),2rem)]">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-4xl">
            ✅
          </div>
          <h1 className="mt-6 text-2xl font-bold text-navy">Delivered</h1>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            Your package reached safely. Thank you for choosing CarryCub.
          </p>
          <p className="mt-4 text-xs tracking-wider text-gray-400">{booking.id}</p>

          {driver?.name && (
            <div className="mt-8 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl">
                🧑
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-navy">{driver.name}</p>
                <p className="text-xs text-gray-500">
                  {driverVehicle?.name} · {driver.vehicleNo ?? TEST_DRIVER.vehicleNo}
                </p>
              </div>
            </div>
          )}

          <div className="mt-10 w-full">
            {ratingSubmitted ? (
              <p className="text-sm font-medium text-brand-dark">
                Thanks for rating your trip! 🙌
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600">Rate your driver</p>
                <div className="mt-3 flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = (hoverRating || rating) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setRating(n);
                          setRatingSubmitted(true);
                        }}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="text-3xl leading-none"
                        aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                      >
                        {filled ? "⭐" : "☆"}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <Link
          href="/"
          className="mt-6 block w-full rounded-2xl bg-brand py-3.5 text-center text-base font-semibold text-white active:bg-brand-dark"
        >
          Book Again
        </Link>
      </main>
    );
  }

  const tone = isCancelled ? "bg-red-50" : "bg-orange-50";

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#f3f4f6]">
      {/* ---------- Big map on top ---------- */}
      <div className="relative h-[52dvh] shrink-0">
        <TrackingMap
          pickup={booking.pickupLoc}
          drop={booking.dropLoc}
          driver={location}
          className="relative isolate h-full w-full"
        />

        {/* Floating top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <div className="pointer-events-auto rounded-2xl bg-white/95 px-3 py-1.5 shadow">
            <p className="text-[10px] leading-tight text-gray-500">Booking ID</p>
            <p className="text-xs font-bold tracking-wider text-navy">{booking.id}</p>
          </div>
          <Link
            href="/"
            className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-navy shadow"
          >
            New booking
          </Link>
        </div>
      </div>

      {/* ---------- Bottom sheet ---------- */}
      <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.18)]">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-200" />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${tone}`}
            >
              {isSearching && (
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" />
              )}
              <span className="relative">{info.emoji}</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold leading-tight text-navy">{info.title}</h2>
              <p className="mt-0.5 text-xs text-gray-500">{info.message}</p>
            </div>
          </div>

          {/* Progress bar */}
          {!isCancelled && (
            <div className="mt-3 flex gap-1">
              {FLOW.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= flowIndex ? "bg-brand" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Driver */}
          {driverAssigned ? (
            <div className="mt-3 rounded-2xl border border-gray-200 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                  🧑
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">
                    {driver?.name ?? TEST_DRIVER.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {driverVehicle?.name} · {driver?.vehicleNo ?? TEST_DRIVER.vehicleNo}
                  </p>
                </div>
                {isTripLive && (
                  <span className="shrink-0 text-[10px] text-gray-400">
                    {location ? `📍 ${fmtTime(location.updatedAt)}` : "📍 waiting…"}
                  </span>
                )}
              </div>
              {/* Number is never printed — only used as the tel:/wa.me target. */}
              {driver?.phone && (
                <div className="mt-2.5 flex gap-2">
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
            !isCancelled && (
              <p className="mt-3 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
                Driver details will appear here once a driver is assigned.
              </p>
            )
          )}

          {/* Route + fare */}
          <div className="mt-3 flex items-stretch gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
            <div className="flex flex-col items-center py-1">
              <span className="h-2.5 w-2.5 rounded-full bg-brand" />
              <span className="my-0.5 w-px flex-1 bg-gray-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-navy" />
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-xs font-medium text-navy">
              <p className="truncate">{booking.pickup}</p>
              <p className="truncate">{booking.drop}</p>
            </div>
            {booking.estimatedFare != null && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-gray-400">Fare</p>
                <p className="text-base font-bold text-navy">₹{booking.estimatedFare}</p>
              </div>
            )}
          </div>

          {/* Details toggle */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-3 w-full py-1 text-center text-xs font-medium text-brand-dark"
          >
            {showDetails ? "Hide details ▲" : "All steps & details ▼"}
          </button>

          {showDetails && (
            <div className="mt-2">
              {/* Timeline */}
              {!isCancelled && (
                <ol>
                  <li className="relative flex items-start gap-4 pb-5">
                    <span className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-brand" />
                    <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-white">
                      ✓
                    </span>
                    <span className="pt-0.5 text-sm text-gray-600">Booking Confirmed</span>
                  </li>
                  {FLOW.map((s, i) => {
                    const done = i < flowIndex;
                    const current = i === flowIndex;
                    const last = i === FLOW.length - 1;
                    return (
                      <li key={s.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
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
                          {done ? (
                            "✓"
                          ) : current ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                          ) : null}
                        </span>
                        <span
                          className={`pt-0.5 text-sm ${
                            current
                              ? "font-semibold text-navy"
                              : done
                                ? "text-gray-600"
                                : "text-gray-400"
                          }`}
                        >
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Trip details */}
              <div className="mt-4 space-y-2.5 rounded-2xl border border-gray-200 px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="shrink-0 text-gray-500">Vehicle</span>
                  <span className="min-w-0 break-words text-right font-medium">
                    {vehicle ? vehicle.name : booking.vehicleId}
                  </span>
                </div>
                {booking.distanceKm != null && (
                  <div className="flex justify-between gap-4">
                    <span className="shrink-0 text-gray-500">Distance</span>
                    <span className="font-medium">~{booking.distanceKm} km</span>
                  </div>
                )}
                {isTripLive && location && (
                  <a
                    href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs font-medium text-brand-dark"
                  >
                    Open driver location in Maps
                  </a>
                )}
              </div>

              {/* Cancel (customer) */}
              {canCancel(status) && (
                <div className="mt-4">
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
            </div>
          )}

          {isCancelled && (
            <Link
              href="/"
              className="mt-4 block w-full rounded-2xl bg-brand py-3.5 text-center text-base font-semibold text-white active:bg-brand-dark"
            >
              New booking
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
