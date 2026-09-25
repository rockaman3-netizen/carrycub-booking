"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currentDriver, driverLogin } from "@/lib/driver-auth";

export default function DriverLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentDriver()) router.replace("/driver");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const driver = await driverLogin(phone);
    if (driver) router.replace("/driver");
    else setError("No driver found with that phone number");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6]">
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-brand">CarryCub</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Driver login</h1>
          <p className="mt-1 text-sm text-gray-500">Test build — not real authentication</p>

          <form onSubmit={handleSubmit} noValidate className="mt-6">
            <label className="block text-sm font-medium text-gray-500">Mobile number</label>
            <input
              type="tel"
              inputMode="numeric"
              className="w-full border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2.5 text-base outline-none focus:border-brand"
              placeholder="10-digit number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              autoFocus
            />
            {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
            <button
              type="submit"
              className="mt-8 w-full rounded-2xl bg-navy py-3.5 text-base font-semibold text-white active:bg-navy/90"
            >
              Log in
            </button>
          </form>

          {process.env.NEXT_PUBLIC_SHOW_TEST_HINTS === "true" && (
            <p className="mt-4 text-center text-xs text-gray-400">
              Dev hint enabled via NEXT_PUBLIC_SHOW_TEST_HINTS — see the seed
              driver list in src/lib/drivers.ts for test phone numbers.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
