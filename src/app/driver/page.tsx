import DriverGuard from "@/components/DriverGuard";
import DriverBookingList from "@/components/driver/BookingList";

export default function DriverHomePage() {
  return (
    <DriverGuard>
      <DriverBookingList />
    </DriverGuard>
  );
}
