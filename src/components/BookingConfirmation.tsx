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
import { registerPushToken } from "@/lib/firebase-client";

function CopyBookingId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
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

const CANCEL_REASONS = [
  "Booked by mistake",
  "Price too high",
  "Taking too long",
  "Plan changed",
  "Other",
];

// Same fixed, full-screen overlay sheet as TrackingView — appears instantly
// over everything, no scrolling required to reach it.
function CancelSheet({
  open,
  reason,
  setReason,
  otherReason,
  setOtherReason,
  cancelling,
  onClose,
  onConfirm,
}: {
  open: boolean;
  reason: string | null;
  setReason: (r: string) => void;
  otherReason: string;
  setOtherReason: (v: string) => void;
  cancelling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-[0_-8px_30px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-out"
        style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
        <p className="text-base font-semibold text-gray-900">Why are you cancelling?</p>

        <div className="mt-3 flex flex-col gap-2">
          {CANCEL_REASONS.map((r) => {
            const selected = reason === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition ${
                  selected
                    ? "border-gray-800 bg-gray-50 font-medium text-gray-900"
                    : "border-gray-200 text-gray-600 active:bg-gray-50"
                }`}
              >
                {r}
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    selected
                      ? "border-gray-800 bg-gray-800 ring-2 ring-inset ring-white"
                      : "border-gray-300"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {reason === "Other" && (
          <textarea
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Tell us a bit more…"
            rows={2}
            maxLength={200}
            className="mt-3 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-700 disabled:opacity-60"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={cancelling || !reason || (reason === "Other" && !otherReason.trim())}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {cancelling ? "Cancelling…" : "Confirm Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BookingConfirmation({ id }: { id: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<StoredBooking | null | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    rememberRecentBookingId(id);
  }, [id]);

  useEffect(() => {
    registerPushToken({ role: "customer", bookingId: id });
  }, [id]);

  usePolling(
    async () => {
      const b = await getBooking(id);
      setBooking((prev) => b ?? (prev ? prev : null));
    },
    [id],
  );

  useEffect(() => {
    if (booking && booking.status !== "searching") {
      router.replace(`/track/${booking.id}`);
    }
  }, [booking, router]);

  function closeCancelSheet() {
    setCancelOpen(false);
    setCancelReason(null);
    setOtherReason("");
  }

  async function handleCancel() {
    setCancelling(true);
    const updated = await cancelBooking(id);
    if (updated) setBooking(updated);
    setCancelling(false);
    closeCancelSheet();
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

        {/* Cancel (customer) — opens the fixed full-screen sheet */}
        {canCancel(status) && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-600 active:bg-gray-50"
            >
              Cancel booking
            </button>
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

      <CancelSheet
        open={cancelOpen}
        reason={cancelReason}
        setReason={setCancelReason}
        otherReason={otherReason}
        setOtherReason={setOtherReason}
        cancelling={cancelling}
        onClose={closeCancelSheet}
        onConfirm={handleCancel}
      />
    </main>
  );
}
