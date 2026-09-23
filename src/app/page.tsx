import Link from "next/link";
import BookingForm from "@/components/BookingForm";
import Shell from "@/components/Shell";

export default function Home() {
  return (
    <Shell
      title="Mini Truck"
      accent="Booking"
      subtitle="Fast local goods transport in Jamshedpur"
      action={{ href: "/track", label: "Track booking" }}
    >
      <BookingForm />
      <div className="flex items-center justify-center gap-4 border-t border-gray-100 px-6 py-4 text-center">
        <Link href="/admin/login" className="text-xs text-gray-400">
          Admin panel
        </Link>
        <span className="text-gray-300">·</span>
        <Link href="/driver/login" className="text-xs text-gray-400">
          Driver panel
        </Link>
      </div>
    </Shell>
  );
}
