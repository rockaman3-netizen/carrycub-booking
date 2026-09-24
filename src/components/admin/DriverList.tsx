"use client";

import { useState } from "react";
import { VEHICLES, vehicleById } from "@/lib/vehicles";
import { createDriver, listDrivers, setDriverAvailability, type Driver, type NewDriverInput } from "@/lib/drivers";
import { usePolling } from "@/lib/poll";

const EMPTY_FORM: NewDriverInput = { name: "", phone: "", vehicleType: "", vehicleNo: "" };

export default function DriverList() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [listError, setListError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewDriverInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // Which driver's availability button is currently saving.
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refreshDrivers() {
    try {
      setDrivers(await listDrivers());
      setListError("");
    } catch (err) {
      setListError((err as Error).message || "Could not load drivers");
    }
  }

  usePolling(refreshDrivers, []);

  async function toggle(d: Driver) {
    if (busyId) return;
    setBusyId(d.id);
    try {
      await setDriverAvailability(d.id, !d.available);
    } catch (err) {
      setListError((err as Error).message || "Could not update availability");
    } finally {
      setBusyId(null);
    }
    await refreshDrivers();
  }

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const { driver, error, errors: fieldErrors } = await createDriver(form);
      if (!driver) {
        if (fieldErrors && Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
        else setFormError(error ?? "Could not save driver");
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refreshDrivers();
    } catch (err) {
      setFormError((err as Error).message || "Network problem. Please try again.");
    } finally {
      setSaving(false);
    }
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

      {listError && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {listError}
        </p>
      )}

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
              placeholder="Driver's full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <span className="mt-1 block text-xs text-red-600">{errors.name}</span>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">Mobile number</label>
            <input
              type="tel"
              inputMode="numeric"
              className="w-full min-w-0 border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-base outline-none focus:border-brand"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            {errors.phone && <span className="mt-1 block text-xs text-red-600">{errors.phone}</span>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">Vehicle type</label>
            <select
              className="w-full min-w-0 border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-base outline-none focus:border-brand"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="">Select vehicle</option>
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {errors.vehicleType && <span className="mt-1 block text-xs text-red-600">{errors.vehicleType}</span>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">Vehicle number</label>
            <input
              type="text"
              className="w-full min-w-0 border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-base outline-none focus:border-brand"
              placeholder="e.g. JH01AB1234"
              value={form.vehicleNo}
              onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })}
            />
            {errors.vehicleNo && <span className="mt-1 block text-xs text-red-600">{errors.vehicleNo}</span>}
          </div>

          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 w-full rounded-2xl bg-navy py-3 text-sm font-semibold text-white active:bg-navy/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save driver"}
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-2.5">
        {drivers.map((d) => {
          const vehicle = vehicleById(d.vehicleType);
          const busy = busyId === d.id;
          return (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                🧑
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-navy">{d.name}</p>
                <p className="text-xs text-gray-500">{d.phone}</p>
                <p className="text-xs text-gray-500">
                  {vehicle ? `${vehicle.name}` : d.vehicleType} · {d.vehicleNo}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => toggle(d)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                  d.available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {busy ? "Saving…" : d.available ? "Available" : "Off duty"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
