import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Customer-facing PWA metadata — applies to every route by default
// (booking, tracking, admin). The /driver subtree overrides this with its
// own manifest/app name via src/app/driver/layout.tsx, since it's
// installed as a separate app from the driver's home screen.
export const metadata: Metadata = {
  title: "CarryCub Booking (Test)",
  description: "Standalone CarryCub mini-truck booking — testing build",
  manifest: "/manifest-customer.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
    <html lang="en" className={inter.variable}>
      <body className="antialiased font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
