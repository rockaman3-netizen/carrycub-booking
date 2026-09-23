"use client";

import Link from "next/link";
import { useState } from "react";
import { listBookings, type StoredBooking } from "@/lib/store";
import { bucketOf, type Bucket } from "@/lib/status";
import { usePolling } from "@/lib/poll";
import BookingRow from "@/components/admin/BookingRow";
import EmptyState from "@/components/admin/EmptyState";

const TABS: { bucket: Bucket; label: string; href: string }[] = [
  { bucket: "pending", label: "Pending", href: "/admin/bookings/pending" },
  { bucket: "active", label: "Active", href: "/admin/bookings/active" },
  { bucket: "completed", label: "Completed", href: "/admin/bookings/completed" },
];

const EMPTY_TEXT: Record<Bucket, string> = {
  pending: "No new bookings waiting right now.",
  active: "No bookings currently in progress.",
  completed: "No completed bookings yet.",
  cancelled: "No cancelled bookings.",
};

export default function BookingList({ bucket }: { bucket: Bucket }) {
  const [bookings, setBookings] = useState<StoredBooking[]>([]);

  usePolling(async () => setBookings(await listBookings()), []);

  const filtered = bookings.filter((b) => bucketOf(b.status) === bucket);

  return (
    <div className="px-5 py-6">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.bucket}
            href={t.href}
            className={`flex-1 rounded-xl py-2 text-center text-xs font-semibold ${
              t.bucket === bucket ? "bg-navy text-white" : "bg-white text-gray-500 border border-gray-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <EmptyState text={EMPTY_TEXT[bucket]} />
        ) : (
          filtered.map((b) => <BookingRow key={b.id} booking={b} />)
        )}
      </div>
    </div>
  );
}
