"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currentDriver, driverLogout } from "@/lib/driver-auth";
import type { Driver } from "@/lib/drivers";

export default function DriverGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);

  useEffect(() => {
    const d = currentDriver();
    if (d) setDriver(d);
    else router.replace("/driver/login");
  }, [router]);

  if (!driver) return <p className="px-6 py-12 text-center text-sm text-gray-400">Loading...</p>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-5 pb-4 pt-[max(env(safe-area-inset-top),1rem)] text-white">
        <Link href="/driver" className="min-w-0">
          <span className="block text-sm font-bold tracking-wide">CarryCub Driver</span>
          <span className="block truncate text-xs text-white/60">{driver.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            driverLogout();
            router.replace("/driver/login");
          }}
          className="shrink-0 text-xs font-medium text-white/70"
        >
          Log out
        </button>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
