"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BookingForm from "@/components/BookingForm";
import Shell from "@/components/Shell";
import { getStatus } from "@/lib/status";
import { getBooking, type StoredBooking } from "@/lib/store";
import { getRecentBookingIds } from "@/lib/recent-bookings";

const CHECKED_KEY = "carrycub:resume-checked";

// If the person has a booking in progress, take them back to it (once each
// time the app is opened) and keep a "booking in progress" card on top of
// the form afterwards.
function ResumeBooking() {
  const router = useRouter();
  const [active, setActive] = useState<StoredBooking | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = getRecentBookingIds();
      if (ids.length === 0) return;
      const b = await getBooking(ids[0]);
      if (cancelled || !b) return;
      if (b.status === "delivered" || b.status === "cancelled") return;
      setActive(b);

      let firstOpen = true;
      try {
        firstOpen = sessionStorage.getItem(CHECKED_KEY) !== "1";
        sessionStorage.setItem(CHECKED_KEY, "1");
      } catch {
        /* ignore */
      }
      if (firstOpen) router.replace(`/track/${encodeURIComponent(b.id)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!active) return null;
  return (
    <Link
      href={`/track/${encodeURIComponent(active.id)}`}
      className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 active:bg-orange-100"
    >
      <span className="min-w-0">
        <span className="block text-xs text-gray-500">Your booking is in progress</span>
        <span className="block truncate text-sm font-semibold tracking-wide text-navy">
          {active.id} · {getStatus(active.status).label}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-brand-dark">Track →</span>
    </Link>
  );
}

export default function Home() {
  return (
    <Shell
      title="Mini Truck"
      accent="Booking"
      subtitle="Fast local goods transport in Jamshedpur"
      action={{ href: "/track", label: "Track booking" }}
      banner="/banner-mini-trucks.webp"
      bannerFull
    >
      <ResumeBooking />
      <BookingForm />
      <div className="flex items-center justify-center gap-4 border-t border-gray-100 px-6 py-3 text-center">
        <Link href="/track" className="text-xs text-gray-400">
          Track booking
        </Link>
        <span className="text-gray-300">·</span>
        <Link href="/admin/login" className="text-xs text-gray-400">
          Admin panel
        </Link>
        <span className="text-gray-300">·</span>
        <Link href="/driver/login" className="text-xs text-gray-400">
          Driver panel
        </Link>
      </div>
    </Shell>
  );
}
