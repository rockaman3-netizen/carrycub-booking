"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { vehicleById } from "@/lib/vehicles";
import { fmtTime } from "@/lib/format";
import { FLOW, getStatus, nextStatus } from "@/lib/status";
import {
  acceptBooking,
  driverAdvanceStatus,
  fetchBooking,
  rejectBooking,
  updateDriverLocation,
  type StoredBooking,
} from "@/lib/store";
import { currentDriverId } from "@/lib/driver-auth";
import { useDriverLocationShare, type GeoShareStatus } from "@/lib/geolocation";
import { usePolling } from "@/lib/poll";
import { CallButton, WhatsAppButton } from "@/components/ContactActions";

const GPS_MESSAGE: Record<GeoShareStatus, string | null> = {
  idle: null,
  requesting: "Requesting location permission…",
  sharing: "📍 Sharing your live location with admin and the customer.",
  denied:
    "Location permission denied. Enable location for this site in your browser settings to share your position.",
  unavailable: "Couldn't get a GPS fix. Sharing will resume automatically once signal is available.",
  unsupported: "This browser doesn't support location sharing.",
};

type ActionResult = { booking: StoredBooking | null; error?: string };

// Universal maps link: opens the native Maps app on iOS/Android when
// launched from a PWA/mobile browser, falls back to Google Maps on web.
function mapsUrl(label: string, loc: { lat: number; lng: number } | null | undefined) {
  const destination = loc ? `${loc.lat},${loc.lng}` : encodeURIComponent(label);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

function NavigateButton({
  label,
  loc,
}: {
  label: string;
  loc: { lat: number; lng: number } | null | undefined;
}) {
  return (
    <a
      href={mapsUrl(label, loc)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Navigate to ${label}`}
      className="flex shrink-0 items-center gap-1 rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white active:bg-navy/90"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
        <path d="M12 2 3 21l9-4.5L21 21 12 2z" />
      </svg>
      Navigate
    </a>
  );
}

export default function DriverBookingDetail({ id }: { id: string }) {
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  // True while a button action (accept / reject / status) is in flight.
  const [busy, setBusy] = useState(false);
  // True when the last poll failed for a network/server reason (not "not found").
  const [connError, setConnError] = useState(false);
  // Bumped whenever a button action starts or ends, so an older poll response
  // that arrives late can't overwrite the newer status.
  const actionSeq = useRef(0);
  // Manual location-sharing toggle — the driver decides when to start/stop,
  // rather than it being silently tied to trip status.
  const [sharingOn, setSharingOn] = useState(false);
  const driverId = currentDriverId();

  // Polls so this stays in sync if admin reassigns/cancels elsewhere.
  usePolling(async () => {
    const seq = actionSeq.current;
    const result = await fetchBooking(id);
    if (seq !== actionSeq.current) return; // an action ran meanwhile; this snapshot may be stale
    if (result.kind === "ok") {
      setBooking(result.booking);
      setConnError(false);
    } else if (result.kind === "notFound") {
      setBooking(null);
      setConnError(false);
    } else {
      // Network/server hiccup: keep whatever we already show, just flag it.
      setConnError(true);
    }
  }, [id]);

  // Hooks must run unconditionally (Rules of Hooks), so GPS sharing is wired up
  // here — before the loading/not-found guards below. Only actually runs once
  // a booking is loaded, assigned to this driver, still open, and the driver
  // has switched sharing on.
  const isFinishedForShare = booking?.status === "delivered" || booking?.status === "cancelled";
  const shareActive =
    booking != null && booking.driverId === driverId && !isFinishedForShare && sharingOn;
  const onLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!driverId) return;
      try {
        const res = await updateDriverLocation(id, driverId, lat, lng);
        if (res.booking) setBooking(res.booking);
      } catch {
        // Ignore a single failed location send; the next fix will retry.
      }
    },
    [id, driverId],
  );
  const gpsStatus = useDriverLocationShare(shareActive, onLocation);
  const gpsMessage = shareActive ? GPS_MESSAGE[gpsStatus] : null;

  if (booking === undefined) {
    return (
      <p className="px-5 py-12 text-center text-sm text-gray-400">
        {connError ? "Connection problem. Retrying…" : "Loading..."}
      </p>
    );
  }
  if (booking === null) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-gray-500">Booking not found.</p>
        <Link href="/driver" className="mt-4 inline-block text-sm font-medium text-brand-dark">
          ← Back to bookings
        </Link>
      </div>
    );
  }

  const mine = booking.driverId === driverId;
  const vehicle = vehicleById(booking.vehicleId);
  const info = getStatus(booking.status);
  const next = nextStatus(booking.status);
  const nextInfo = next ? getStatus(next) : null;
  const isAssigned = booking.status === "assigned";
  const isFinished = booking.status === "delivered" || booking.status === "cancelled";
  const canAdvance = mine && !isAssigned && !isFinished && next;
  const canShareLocation = mine && !isAssigned && !isFinished;

  // Runs one button action at a time, shows errors, and keeps the screen in
  // sync with whatever the server says the booking looks like now.
  async function run(action: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setError("");
    actionSeq.current += 1;
    try {
      const res = await action();
      if (res.booking) setBooking(res.booking);
      if (res.error) setError(res.error);
    } catch {
      setError("Network problem. Please check your connection and try again.");
    } finally {
      actionSeq.current += 1;
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-6 pb-40">
      <Link href="/driver" className="text-xs font-medium text-gray-500">
        ← Assigned bookings
      </Link>

      {connError && (
        <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-center text-xs text-orange-700">
          Connection problem. Retrying…
        </p>
      )}

      {/* Current status — the one thing a driver needs at a glance */}
      <div className="mt-3 rounded-2xl bg-orange-50 px-4 py-4 text-center">
        <span className="text-2xl">{info.emoji}</span>
        <h1 className="mt-1 text-base font-bold text-navy">{info.title}</h1>
        <p className="mt-2 text-xs font-semibold tracking-wide text-gray-500">{booking.id}</p>
        <p className="text-[11px] text-gray-400">Booked {fmtTime(booking.createdAt)}</p>
      </div>

      {!mine && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          This booking is no longer assigned to you.
        </p>
      )}

      {/* Customer — contact actions only for the driver this booking is
          currently assigned to (mine); a booking reassigned out from under
          this driver still shows the name for context but hides the number. */}
      <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-gray-500">Customer</span>
          <span className="min-w-0 break-words text-right font-medium">{booking.name}</span>
        </div>
        {mine ? (
          <div className="flex gap-2 border-t border-gray-100 pt-3">
            <CallButton phone={booking.mobile} label="Call Customer" />
            <WhatsAppButton
              phone={booking.mobile}
              label="WhatsApp"
              message={`Hi, this is your CarryCub driver for booking ${booking.id}.`}
            />
          </div>
        ) : (
          <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
            Contact hidden — this booking is no longer assigned to you.
          </p>
        )}
      </div>

      {/* Trip — pickup/drop each get a one-tap Navigate button */}
      <div className="mt-4 space-y-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-gray-500">Pickup</span>
            <p className="break-words font-medium text-navy">{booking.pickup}</p>
          </div>
          <NavigateButton label={booking.pickup} loc={booking.pickupLoc} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="min-w-0 flex-1">
            <span className="text-gray-500">Drop</span>
            <p className="break-words font-medium text-navy">{booking.drop}</p>
          </div>
          <NavigateButton label={booking.drop} loc={booking.dropLoc} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <span className="text-gray-500">Vehicle</span>
          <span className="text-right font-medium text-navy">
            {vehicle ? `${vehicle.name}` : booking.vehicleId}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-500">Fare</span>
          <span className="text-right font-semibold text-navy">
            {booking.estimatedFare != null ? (
              <>
                ₹{booking.estimatedFare}
                {booking.distanceKm != null && (
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (~{booking.distanceKm} km)
                  </span>
                )}
              </>
            ) : (
              <span className="font-normal text-gray-400">Not estimated</span>
            )}
          </span>
        </div>
        {booking.notes && (
          <div className="flex justify-between gap-4 border-t border-gray-100 pt-4">
            <span className="shrink-0 text-gray-500">Notes</span>
            <span className="min-w-0 break-words text-right font-medium">{booking.notes}</span>
          </div>
        )}
      </div>

      {/* Location sharing — driver controls it explicitly */}
      {canShareLocation && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">Live location sharing</p>
              <p className="text-xs text-gray-500">
                {sharingOn ? "Visible to admin and the customer" : "Currently off"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSharingOn((v) => !v)}
              aria-pressed={sharingOn}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
                sharingOn ? "bg-red-50 text-red-600" : "bg-brand text-white"
              }`}
            >
              {sharingOn ? "Stop Sharing" : "Start Sharing"}
            </button>
          </div>
          {gpsMessage && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                gpsStatus === "sharing"
                  ? "bg-green-50 text-green-700"
                  : gpsStatus === "denied" || gpsStatus === "unsupported"
                    ? "bg-red-50 text-red-700"
                    : "bg-orange-50 text-orange-700"
              }`}
            >
              <p>{gpsMessage}</p>
              {booking.driverLocation && (
                <p className="mt-1 opacity-80">
                  Last sent: {booking.driverLocation.lat.toFixed(5)}, {booking.driverLocation.lng.toFixed(5)}{" "}
                  · {fmtTime(booking.driverLocation.updatedAt)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      <ol className="mt-6">
        {FLOW.map((s, i) => {
          const idx = FLOW.findIndex((x) => x.id === booking.status);
          const done = booking.status === "delivered" || i < idx;
          const current = booking.status !== "delivered" && i === idx;
          const last = i === FLOW.length - 1;
          return (
            <li key={s.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
              {!last && (
                <span
                  className={`absolute bottom-0 left-[11px] top-6 w-0.5 ${
                    i < idx ? "bg-brand" : "bg-gray-200"
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {mine && booking.status === "delivered" && (
        <p className="mt-6 rounded-2xl bg-green-50 px-4 py-3 text-center text-sm text-green-700">
          🎉 Delivered. Nice work!
        </p>
      )}

      {/* Sticky bottom action bar — the one or two things a driver needs to
          tap for this booking, always in thumb reach. */}
      {mine && (isAssigned || canAdvance) && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            {isAssigned ? (
              !confirmReject ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmReject(true)}
                    className="shrink-0 rounded-2xl border border-red-200 px-5 py-3.5 text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => driverId && run(() => acceptBooking(booking.id, driverId))}
                    className="flex-1 rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark disabled:opacity-60"
                  >
                    {busy ? "Please wait…" : "Accept booking"}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-red-50 p-4 text-center">
                  <p className="text-sm text-red-700">Reject this booking? It will go back to admin.</p>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmReject(false)}
                      className="flex-1 rounded-xl bg-white py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                    >
                      Keep booking
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (driverId) run(() => rejectBooking(booking.id, driverId));
                        setConfirmReject(false);
                      }}
                      className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Yes, reject
                    </button>
                  </div>
                </div>
              )
            ) : (
              canAdvance &&
              nextInfo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => driverId && next && run(() => driverAdvanceStatus(booking.id, driverId, next))}
                  className="w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark disabled:opacity-60"
                >
                  {busy ? "Please wait…" : `Mark: ${nextInfo.emoji} ${nextInfo.label}`}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
