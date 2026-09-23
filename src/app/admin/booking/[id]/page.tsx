import AdminGuard from "@/components/AdminGuard";
import BookingDetail from "@/components/admin/BookingDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminGuard>
      <BookingDetail id={id} />
    </AdminGuard>
  );
}
