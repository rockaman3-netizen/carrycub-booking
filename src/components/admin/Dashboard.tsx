"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { listBookings, type StoredBooking } from "@/lib/store";
import { opsGroupOf, type OpsGroup } from "@/lib/status";
import { listDrivers, type Driver } from "@/lib/drivers";
import { usePolling } from "@/lib/poll";
import BookingRow from "@/components/admin/BookingRow";
import EmptyState from "@/components/admin/EmptyState";

type StatFilter = "all" | OpsGroup;

const STATS: { key: StatFilter; label: string }[] = [
  { key: "all", label: "Total bookings" },
  { key: "pending", label: "Pending" },
  { key: "assigned", label: "Assigned" },
  { key: "active", label: "Active deliveries" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Dashboard() {
  const [bookings, setBookings] = useState<StoredBooking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatFilter>("all");

  usePolling(async () => setBookings(await listBookings()), []);
  usePolling(async () => setDrivers(await listDrivers()), [], 15000);

  const counts: Record<StatFilter, number> = {
    all: bookings.length,
    pending: 0,
    assigned: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const b of bookings) counts[opsGroupOf(b.status)]++;

  const availableDrivers = drivers.filter((d) => d.available).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((b) => filter === "all" || opsGroupOf(b.status) === filter)
      .filter((b) => {
        if (!q) return true;
        return (
          b.id.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          b.mobile.toLowerCase().includes(q)
        );
      });
  }, [bookings, query, filter]);

  const isFiltering = filter !== "all" || query.trim().length > 0;

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold text-navy">Dashboard</h1>
      <p className="text-xs text-gray-400">Live data · synced from Google Sheets</p>

      {/* Stats — tap a tile to filter the list below by that status group */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {STATS.map((s) => {
          const selected = filter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setFilter(selected ? "all" : s.key)}
              aria-pressed={selected}
              className={`rounded-2xl border px-2 py-4 text-center transition ${
                selected
                  ? "border-navy bg-navy text-white"
                  : "border-gray-200 bg-white active:bg-gray-50"
              }`}
            >
              <p className={`text-2xl font-bold ${selected ? "text-white" : "text-navy"}`}>
                {counts[s.key]}
              </p>
              <p className={`mt-1 text-[11px] leading-tight ${selected ? "text-white/80" : "text-gray-500"}`}>
                {s.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-navy">Drivers available</p>
          <p className="text-xs text-gray-500">{availableDrivers} of {drivers.length} on duty</p>
        </div>
        <Link href="/admin/drivers" className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-dark">
          Manage →
        </Link>
      </div>

      {/* Search */}
      <div className="mt-6">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Booking ID, name, or mobile"
            className="w-full min-w-0 text-ellipsis rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-9 text-base outline-none placeholder:text-[13px] placeholder:text-gray-400 focus:border-brand"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-navy">
          {isFiltering ? `Results (${filtered.length})` : "Recent bookings"}
        </h2>
        {isFiltering && (
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-dark"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <EmptyState
            text={
              isFiltering
                ? "No bookings match your search/filter."
                : "No bookings yet on this device."
            }
          />
        ) : (
          (isFiltering ? filtered : filtered.slice(0, 5)).map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))
        )}
      </div>
    </div>
  );
}
