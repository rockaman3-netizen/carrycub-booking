import AdminGuard from "@/components/AdminGuard";
import Dashboard from "@/components/admin/Dashboard";

export default function AdminHomePage() {
  return (
    <AdminGuard>
      <Dashboard />
    </AdminGuard>
  );
}
