import DriverGuard from "@/components/DriverGuard";
import DriverBookingDetail from "@/components/driver/BookingDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DriverGuard>
      <DriverBookingDetail id={id} />
    </DriverGuard>
  );
}
