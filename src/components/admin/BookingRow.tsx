import Link from "next/link";
import { vehicleById } from "@/lib/vehicles";
import { fmtTime } from "@/lib/format";
import type { StoredBooking } from "@/lib/store";
import StatusPill from "@/components/admin/StatusPill";

export default function BookingRow({ booking }: { booking: StoredBooking }) {
  const vehicle = vehicleById(booking.vehicleId);
  // Denormalized onto the booking row at assign time — no lookup needed.
  const driverName = booking.driverId ? booking.driverName : null;

  return (
    <Link
      href={`/admin/booking/${encodeURIComponent(booking.id)}`}
      className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 active:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-wide text-navy">{booking.id}</span>
        <StatusPill status={booking.status} />
      </div>

      <p className="truncate text-xs font-medium text-gray-600">
        {booking.name} · +91 {booking.mobile}
      </p>

      <p className="truncate text-xs text-gray-500">
        {booking.pickup} → {booking.drop}
      </p>

      <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
        <span className="truncate">
          {vehicle ? `${vehicle.emoji} ${vehicle.name}` : booking.vehicleId}
        </span>
        <span className="shrink-0 font-medium text-navy">
          {booking.estimatedFare != null ? `₹${booking.estimatedFare}` : "Fare TBD"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-400">
        <span className="truncate">
          {driverName ? `🧑 ${driverName}` : "Driver: unassigned"}
        </span>
        <span className="shrink-0">{fmtTime(booking.createdAt)}</span>
      </div>
    </Link>
  );
}
