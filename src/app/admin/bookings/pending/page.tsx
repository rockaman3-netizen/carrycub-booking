import AdminGuard from "@/components/AdminGuard";
import BookingList from "@/components/admin/BookingList";

export default function Page() {
  return (
    <AdminGuard>
      <BookingList bucket="pending" />
    </AdminGuard>
  );
}
