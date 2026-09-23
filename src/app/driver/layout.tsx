import type { Metadata } from "next";

// Overrides the root layout's (customer) manifest/app-name for everything
// under /driver, so installing from a driver's phone produces its own app
// — separate icon, name, and start_url — instead of the customer one.
export const metadata: Metadata = {
  title: "CarryCub Driver",
  description: "CarryCub driver panel — accept bookings, update trip status, share live location.",
  manifest: "/manifest-driver.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CarryCub Driver",
  },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
