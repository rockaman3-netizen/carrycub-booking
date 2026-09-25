"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VEHICLES } from "@/lib/vehicles";
import { canCancel, getStatus, type StatusId } from "@/lib/status";
import { getBooking, cancelBooking, type StoredBooking } from "@/lib/store";
import { rememberRecentBookingId } from "@/lib/recent-bookings";
import { usePolling } from "@/lib/poll";

function CopyBookingId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        // Fallback for browsers/webviews without the Clipboard API
        const el = document.createElement("textarea");
        el.value = id;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: silently ignore, ID is still visible on screen */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy booking ID"
      className="flex items-center gap-1.5 rounded-full bg-gray-200/70 px-3 py-1.5 text-xs font-medium text-gray-700 active:bg-gray-300"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// Shown briefly right after "Book Now", while the booking record is being
// created/fetched — replaces a blank white screen with something branded.
function LoadingScreen() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 bg-[#f3f4f6] px-6 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
          🚚
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-navy">Setting up your booking…</p>
        <p className="mt-1 text-xs text-gray-500">This will just take a moment</p>
      </div>
    </main>
  );
}

export default function BookingConfirmation({ id }: { id: string }) {
  const router = useRouter();
  // undefined = still loading, null = not found
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    rememberRecentBookingId(id);
  }, [id]);

  usePolling(
    async () => {
      const b = await getBooking(id);
      // A failed poll (e.g. right after the app comes back from the
      // background) returns null. Once loaded, keep showing the booking.
      setBooking((prev) => b ?? (prev ? prev : null));
    },
    [id],
  );

  // As soon as a driver is assigned (status leaves "searching"), jump the
  // customer straight to the live tracking screen instead of making them
  // tap "Track Booking" themselves. Cancellations/still-searching stay put.
  useEffect(() => {
    if (booking && booking.status !== "searching") {
      router.replace(`/track/${booking.id}`);
    }
  }, [booking, router]);

  async function handleCancel() {
    setCancelling(true);
    const updated = await cancelBooking(id);
    if (updated) setBooking(updated);
    setCancelling(false);
    setConfirmCancel(false);
  }

  if (booking === undefined) {
    return <LoadingScreen />;
  }

  if (booking === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 bg-[#f3f4f6] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">
          🔍
        </div>
        <h2 className="text-lg font-bold text-navy">Booking not found</h2>
        <p className="text-sm text-gray-500">
          We couldn&apos;t find <span className="font-medium">{id.toUpperCase()}</span> on this
          device.
        </p>
        <Link
          href="/"
          className="mt-2 w-full rounded-2xl bg-brand py-3.5 text-center text-base font-semibold text-white active:bg-brand-dark"
        >
          New booking
        </Link>
      </main>
    );
  }

  const status: StatusId = booking.status;
  const info = getStatus(status);
  const vehicle = VEHICLES.find((v) => v.id === booking.vehicleId);
  const tone =
    status === "cancelled" ? "bg-red-50" : status === "delivered" ? "bg-green-50" : "bg-orange-50";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6] shadow-sm">
      {/* Brand header */}
      <header className="relative overflow-hidden bg-white px-6 pb-6 pt-[max(env(safe-area-inset-top),1.75rem)] text-center">
        <Image
          src="/carrycub-wordmark.png"
          alt="CarryCub"
          width={520}
          height={116}
          priority
          className="mx-auto h-auto w-40"
        />

        <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-2xl">
            ✓
          </span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Booking Confirmed!</h1>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5">
          <span className="text-xs font-medium tracking-wider text-gray-600">
            {booking.id}
          </span>
          <CopyBookingId id={booking.id} />
        </div>
      </header>

      {/* Card */}
      <div className="-mt-4 flex flex-1 flex-col rounded-t-3xl bg-white px-5 pb-6 pt-4 shadow-sm">
        {/* Current status */}
        <div className={`rounded-2xl px-5 py-5 text-center ${tone}`}>
          <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
            {status === "searching" && (
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" />
            )}
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
              {info.emoji}
            </span>
          </div>
          <p className="mt-3 text-base font-bold text-navy">
            {info.title}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {info.message}
          </p>
        </div>

        {/* Trip details */}
        <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 px-4 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500">Pickup</p>
              <p className="break-words text-sm font-medium text-navy">{booking.pickup}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-navy" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-500">Drop</p>
              <p className="break-words text-sm font-medium text-navy">{booking.drop}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">Vehicle</span>
              <span className="text-right text-sm font-semibold text-navy">
                {vehicle ? `${vehicle.name}` : booking.vehicleId}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="shrink-0 text-sm text-gray-500">Estimated fare</span>
              <span className="text-right text-sm font-semibold text-navy">
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
                  <span className="font-normal text-gray-400">Driver will confirm</span>
                )}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">Status</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-brand-dark">
                {info.label}
              </span>
            </div>
          </div>
        </div>

        {/* Cancel while still searching (booking hasn't been picked up by
            the tracking screen yet since a driver isn't assigned) */}
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
                    disabled={cancelling}
                    className="flex-1 rounded-xl bg-white py-2.5 text-sm font-medium text-gray-700 disabled:opacity-60"
                  >
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {cancelling ? "Cancelling…" : "Yes, cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-auto pt-8">
          <Link
            href={`/track/${booking.id}`}
            className="block w-full rounded-2xl bg-brand py-3.5 text-center text-base font-semibold text-white active:bg-brand-dark"
          >
            Track Booking
          </Link>
          <Link
            href="/"
            className="mt-3 block w-full py-2 text-center text-sm font-medium text-gray-500"
          >
            New booking
          </Link>
        </div>
      </div>
    </main>
  );
}
