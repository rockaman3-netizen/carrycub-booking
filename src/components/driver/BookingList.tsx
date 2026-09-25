"use client";

import { useEffect, useState } from "react";
import { vehicleById } from "@/lib/vehicles";
import { fmtTime } from "@/lib/format";
import { bucketOf, getStatus } from "@/lib/status";
import { listDriverBookings, type StoredBooking } from "@/lib/store";
import { currentDriverId } from "@/lib/driver-auth";
import { usePolling } from "@/lib/poll";
import { registerPushToken } from "@/lib/firebase-client";
import Link from "next/link";

// Driver keeps 75% of the fare on every delivered order (25% platform
// commission). Cancelled bookings never earned anything, so they're
// excluded from both the count and the total.
const DRIVER_SHARE = 0.75;

export default function DriverBookingList() {
  const [bookings, setBookings] = useState<StoredBooking[]>([]);

  usePolling(async () => {
    const id = currentDriverId();
    if (id) setBookings(await listDriverBookings(id));
  }, []);

  // Ask for notification permission once, right after the driver's ID is
  // known, so new-booking pushes reach this device even when it's locked.
  useEffect(() => {
    const id = currentDriverId();
    if (id) registerPushToken({ role: "driver", driverId: id });
  }, []);

  const active = bookings.filter((b) => bucketOf(b.status) === "active" || b.status === "assigned");
  const done = bookings.filter((b) => bucketOf(b.status) === "completed" || bucketOf(b.status) === "cancelled");

  const delivered = bookings.filter((b) => b.status === "delivered");
  const totalOrders = delivered.length;
  const totalEarnings = delivered.reduce(
    (sum, b) => sum + (b.estimatedFare != null ? b.estimatedFare * DRIVER_SHARE : 0),
    0,
  );

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold text-navy">Assigned bookings</h1>
      <p className="text-xs text-gray-400">Live data · synced from Google Sheets</p>

      {/* Earnings summary */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium text-gray-500">Orders Completed</p>
          <p className="mt-1 text-xl font-bold text-navy">{totalOrders}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium text-gray-500">Total Earnings</p>
          <p className="mt-1 text-xl font-bold text-navy">
            ₹{Math.round(totalEarnings)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            No bookings assigned to you right now.
          </p>
        ) : (
          active.map((b) => <Row key={b.id} booking={b} />)
        )}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-navy">History</h2>
          <div className="flex flex-col gap-2.5">
            {done.map((b) => (
              <Row key={b.id} booking={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ booking }: { booking: StoredBooking }) {
  const vehicle = vehicleById(booking.vehicleId);
  const info = getStatus(booking.status);
  const needsAction = booking.status === "assigned";
  return (
    <Link
      href={`/driver/booking/${encodeURIComponent(booking.id)}`}
      className={`flex flex-col gap-2 rounded-2xl border bg-white px-4 py-3 active:bg-gray-50 ${
        needsAction ? "border-brand" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="text-sm font-semibold tracking-wide text-navy">{booking.id}</span>
        <span className="whitespace-nowrap rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-brand-dark">
          {info.emoji} {info.label}
        </span>
      </div>
      <p className="line-clamp-2 break-words text-xs text-gray-500">
        {booking.pickup} → {booking.drop}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
        <span>{vehicle ? `${vehicle.name}` : booking.vehicleId}</span>
        <span>{fmtTime(booking.createdAt)}</span>
      </div>
      {needsAction && <p className="text-xs font-medium text-brand-dark">Tap to accept or reject →</p>}
    </Link>
  );
}
