import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Customer-facing PWA metadata — applies to every route by default
// (booking, tracking, admin). The /driver subtree overrides this with its
// own manifest/app name via src/app/driver/layout.tsx, since it's
// installed as a separate app from the driver's home screen.
export const metadata: Metadata = {
  title: "CarryCub Booking (Test)",
  description: "Standalone CarryCub mini-truck booking — testing build",
  manifest: "/manifest-customer.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CarryCub",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1b3f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
