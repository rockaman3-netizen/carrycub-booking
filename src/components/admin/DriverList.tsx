"use client";

import { useState } from "react";
import { vehicleById } from "@/lib/vehicles";
import { listDrivers, setDriverAvailability, type Driver } from "@/lib/drivers";
import { usePolling } from "@/lib/poll";

export default function DriverList() {
  const [drivers, setDrivers] = useState<Driver[]>([]);

  usePolling(async () => setDrivers(await listDrivers()), []);

  async function toggle(d: Driver) {
    await setDriverAvailability(d.id, !d.available);
    setDrivers(await listDrivers());
  }

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold text-navy">Drivers</h1>
      <p className="text-xs text-gray-400">
        Test driver list · toggle availability manually · {drivers.filter((d) => d.available).length} of{" "}
        {drivers.length} on duty
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {drivers.map((d) => {
          const vehicle = vehicleById(d.vehicleType);
          return (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl">
                🧑
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy">{d.name}</p>
                <p className="text-xs text-gray-500">{d.phone}</p>
                <p className="text-xs text-gray-500">
                  {vehicle ? `${vehicle.emoji} ${vehicle.name}` : d.vehicleType} · {d.vehicleNo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(d)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  d.available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {d.available ? "Available" : "Off duty"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
