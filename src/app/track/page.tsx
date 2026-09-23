import Shell from "@/components/Shell";
import TrackLookup from "@/components/TrackLookup";

export default function TrackPage() {
  return (
    <Shell
      title="Track your"
      accent="Booking"
      subtitle="Enter your Booking ID to see its status"
      action={{ href: "/", label: "New booking" }}
    >
      <TrackLookup />
    </Shell>
  );
}
