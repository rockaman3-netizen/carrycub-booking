import Shell from "@/components/Shell";
import TrackingView from "@/components/TrackingView";

export default async function TrackBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Shell
      title="Track your"
      accent="Booking"
      subtitle="Live status of your mini truck"
      action={{ href: "/", label: "New booking" }}
    >
      <TrackingView id={id} />
    </Shell>
  );
}
