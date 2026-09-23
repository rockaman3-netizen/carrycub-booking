export type StatusId =
  | "searching"
  | "assigned"
  | "accepted"
  | "arriving"
  | "arrived"
  | "started"
  | "delivered"
  | "cancelled";

export type StatusInfo = {
  id: StatusId;
  label: string; // short name (timeline / badge)
  title: string; // headline shown to customer
  message: string; // one-line explanation
  emoji: string;
};

// Normal flow, in order
export const FLOW: StatusInfo[] = [
  {
    id: "searching",
    label: "Searching for Driver",
    title: "Searching for nearby driver...",
    message: "We're finding the closest driver for your booking.",
    emoji: "🔎",
  },
  {
    id: "assigned",
    label: "Driver Assigned",
    title: "Driver assigned",
    message: "A driver has been assigned. Waiting for them to accept.",
    emoji: "👤",
  },
  {
    id: "accepted",
    label: "Driver Accepted",
    title: "Driver accepted your booking",
    message: "The driver will head to your pickup location shortly.",
    emoji: "✅",
  },
  {
    id: "arriving",
    label: "Arriving at Pickup",
    title: "Driver is on the way",
    message: "Your driver is heading to the pickup location.",
    emoji: "🚚",
  },
  {
    id: "arrived",
    label: "Arrived at Pickup",
    title: "Driver has arrived",
    message: "Please meet the driver at pickup and load your goods.",
    emoji: "📍",
  },
  {
    id: "started",
    label: "Delivery Started",
    title: "Delivery in progress",
    message: "Your goods are on the way to the drop location.",
    emoji: "📦",
  },
  {
    id: "delivered",
    label: "Delivered",
    title: "Delivered",
    message: "Your delivery is complete. Thank you for choosing CarryCub!",
    emoji: "🎉",
  },
];

export const CANCELLED: StatusInfo = {
  id: "cancelled",
  label: "Cancelled",
  title: "Booking cancelled",
  message: "This booking has been cancelled.",
  emoji: "❌",
};

export function getStatus(id: StatusId): StatusInfo {
  return id === "cancelled" ? CANCELLED : FLOW.find((s) => s.id === id)!;
}

export function nextStatus(id: StatusId): StatusId | null {
  const i = FLOW.findIndex((s) => s.id === id);
  if (i === -1 || i === FLOW.length - 1) return null;
  return FLOW[i + 1].id;
}

// Customer can cancel until the delivery has started
export function canCancel(id: StatusId): boolean {
  const i = FLOW.findIndex((s) => s.id === id);
  const startedIdx = FLOW.findIndex((s) => s.id === "started");
  return i !== -1 && i < startedIdx;
}

// Test-only driver data (no real driver system yet)
export const TEST_DRIVER = {
  name: "Test Driver",
  vehicleNo: "JH 00 XX 0000",
};

export const ALL_STATUSES: StatusInfo[] = [...FLOW, CANCELLED];

export type Bucket = "pending" | "active" | "completed" | "cancelled";

export function bucketOf(id: StatusId): Bucket {
  if (id === "searching") return "pending";
  if (id === "delivered") return "completed";
  if (id === "cancelled") return "cancelled";
  return "active";
}

// Finer-grained operational grouping for the admin dashboard: splits
// "assigned" (driver assigned/accepted, not yet moving) out from
// "active" (actually en route) so ops can see each stage separately.
export type OpsGroup = "pending" | "assigned" | "active" | "completed" | "cancelled";

export function opsGroupOf(id: StatusId): OpsGroup {
  if (id === "searching") return "pending";
  if (id === "assigned" || id === "accepted") return "assigned";
  if (id === "delivered") return "completed";
  if (id === "cancelled") return "cancelled";
  return "active"; // arriving, arrived, started
}
