"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStatus } from "@/lib/status";
import { getBooking, normalizeId, type StoredBooking } from "@/lib/store";
import { getRecentBookingIds } from "@/lib/recent-bookings";

export default function TrackLookup() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<StoredBooking[]>([]);

  useEffect(() => {
    // Bookings are shared (Google Sheets), not per-device anymore, so this
    // can't list "all bookings" without leaking every customer's data — it
    // only re-fetches the IDs this browser has created/viewed before,
    // tracked locally (see src/lib/recent-bookings.ts).
    let cancelled = false;
    (async () => {
      const ids = getRecentBookingIds();
      const results = await Promise.all(ids.map((bid) => getBooking(bid)));
      if (!cancelled) setRecent(results.filter((b): b is StoredBooking => b !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeId(id);
    if (clean.length < 6) {
      setError("Enter your Booking ID (e.g. CC-260922-K7QM)");
      return;
    }
    router.push(`/track/${encodeURIComponent(clean)}`);
  }

  return (
    <div className="flex-1 px-5 pt-5 pb-6">
      <form onSubmit={go} noValidate>
        <label className="block text-sm font-medium text-gray-500">Booking ID</label>
        <input
          className="w-full border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2.5 text-base uppercase tracking-wider outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-400 focus:border-brand"
          placeholder="CC-260922-K7QM"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setError("");
          }}
          autoCapitalize="characters"
          autoComplete="off"
        />
        {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
        <button
          type="submit"
          className="mt-5 w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark"
        >
          Track booking
        </button>
      </form>

      {recent.length > 0 && (
        <div className="mt-10">
          <p className="mb-3 text-sm font-medium text-gray-500">
            Recent test bookings on this device
          </p>
          <ul className="flex flex-col gap-2.5">
            {recent.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/track/${encodeURIComponent(b.id)}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-left active:bg-gray-50"
                >
                  <span className="text-sm font-semibold tracking-wider text-navy">{b.id}</span>
                  <span className="shrink-0 text-right text-xs text-gray-500">{getStatus(b.status).label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
