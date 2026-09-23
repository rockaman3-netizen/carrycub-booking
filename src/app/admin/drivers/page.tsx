import AdminGuard from "@/components/AdminGuard";
import DriverList from "@/components/admin/DriverList";

export default function Page() {
  return (
    <AdminGuard>
      <DriverList />
    </AdminGuard>
  );
}
