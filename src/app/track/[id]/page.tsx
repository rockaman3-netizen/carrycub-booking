import TrackingView from "@/components/TrackingView";

export default async function TrackBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TrackingView id={id} />;
}
