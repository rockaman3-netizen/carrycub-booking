"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { VEHICLES } from "@/lib/vehicles";
import { getStatus, type StatusId } from "@/lib/status";
import { getBooking, type StoredBooking } from "@/lib/store";
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

export default function BookingConfirmation({ id }: { id: string }) {
  // undefined = still loading, null = not found
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);

  useEffect(() => {
    rememberRecentBookingId(id);
  }, [id]);

  usePolling(
    async () => {
      const b = await getBooking(id);
      setBooking(b);
    },
    [id],
  );

  if (booking === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#f3f4f6]">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
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
      <header className="relative overflow-hidden bg-white px-6 pb-8 pt-[max(env(safe-area-inset-top),2.5rem)] text-center">
        <Image
          src="/carrycub-wordmark.png"
          alt="CarryCub"
          width={520}
          height={116}
          priority
          className="mx-auto h-auto w-40"
        />

        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
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
      <div className="-mt-4 flex flex-1 flex-col rounded-t-3xl bg-white px-5 pb-8 pt-6 shadow-sm">
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
        <div className="mt-6 space-y-4 rounded-2xl border border-gray-200 px-4 py-4">
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
