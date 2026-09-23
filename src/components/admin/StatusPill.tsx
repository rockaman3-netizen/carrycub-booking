import { getStatus, type StatusId } from "@/lib/status";

const TONE: Record<string, string> = {
  searching: "bg-orange-100 text-orange-700",
  assigned: "bg-blue-100 text-blue-700",
  accepted: "bg-blue-100 text-blue-700",
  arriving: "bg-blue-100 text-blue-700",
  arrived: "bg-blue-100 text-blue-700",
  started: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function StatusPill({ status }: { status: StatusId }) {
  const info = getStatus(status);
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE[status]}`}>
      {info.emoji} {info.label}
    </span>
  );
}
