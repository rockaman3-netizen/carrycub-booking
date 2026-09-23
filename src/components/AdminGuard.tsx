"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminLogout, isAdminLoggedIn } from "@/lib/admin-auth";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAdminLoggedIn()) setOk(true);
    else router.replace("/admin/login");
  }, [router]);

  if (ok !== true) return <p className="px-6 py-12 text-center text-sm text-gray-400">Loading...</p>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-5 pb-4 pt-[max(env(safe-area-inset-top),1rem)] text-white">
        <Link href="/admin" className="text-sm font-bold tracking-wide">
          CarryCub Admin
        </Link>
        <button
          type="button"
          onClick={() => {
            adminLogout();
            router.replace("/admin/login");
          }}
          className="text-xs font-medium text-white/70"
        >
          Log out
        </button>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
