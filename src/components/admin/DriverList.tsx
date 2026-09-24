"use client";

import { useState } from "react";
import { VEHICLES, vehicleById } from "@/lib/vehicles";
import { createDriver, listDrivers, setDriverAvailability, type Driver, type NewDriverInput } from "@/lib/drivers";
import { usePolling } from "@/lib/poll";

const EMPTY_FORM: NewDriverInput = { name: "", phone: "", vehicleType: "", vehicleNo: "" };

export default function DriverList() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewDriverInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  usePolling(async () => setDrivers(await listDrivers()), []);

  async function toggle(d: Driver) {
    await setDriverAvailability(d.id, !d.available);
    setDrivers(await listDrivers());
  }

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const { driver, error, errors: fieldErrors } = await createDriver(form);
    setSaving(false);
    if (!driver) {
      setErrors(fieldErrors ?? { name: error ?? "Could not save driver" });
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    setDrivers(await listDrivers());
  }

  return (
    <div className="px-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-navy">Drivers</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-full bg-navy px-3.5 py-1.5 text-xs font-semibold text-white active:bg-navy/90"
        >
          {showForm ? "Cancel" : "+ Add driver"}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Test driver list · toggle availability manually · {drivers.filter((d) => d.available).length} of{" "}
        {drivers.length} on duty
      </p>

      {showForm && (
        <form
          onSubmit={handleAddDriver}
          noValidate
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-500">Name</label>
            <input
              type="text"
              className="w-full min-w-0 border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-base outline-none focus:border-brand"
              placeholder="Driver's
