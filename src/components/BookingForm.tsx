"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBooking } from "@/lib/store";
import { rememberRecentBookingId } from "@/lib/recent-bookings";
import { VEHICLES } from "@/lib/vehicles";
import { geocodeAddress, parseCurrentLocationString } from "@/lib/geocode";
import { estimateFare, type FareEstimate } from "@/lib/fare";
import {
  generateBookingId,
  validateBooking,
  type Booking,
  type BookingErrors,
  type BookingInput,
} from "@/lib/booking";

// If pickup was set via the GPS button, its exact device coordinates are
// embedded in the text — use those directly instead of re-geocoding.
// Otherwise resolve the typed address against OpenStreetMap.
async function resolvePickupLoc(text: string) {
  return parseCurrentLocationString(text) ?? (await geocodeAddress(text));
}

const EMPTY: BookingInput = {
  pickup: "",
  drop: "",
  vehicleId: "",
  name: "",
  mobile: "",
  notes: "",
};

const underline =
  "w-full border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2.5 text-base outline-none placeholder:text-gray-400 focus:border-brand";

function Err({ text }: { text?: string }) {
  return text ? <span className="mt-1 block text-sm text-red-600">{text}</span> : null;
}

export default function BookingForm() {
  const [values, setValues] = useState<BookingInput>(EMPTY);
  const [errors, setErrors] = useState<BookingErrors>({});
  const router = useRouter();
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareUnavailable, setFareUnavailable] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Live fare preview: whenever pickup, drop, or vehicle changes, resolve
  // both addresses to real coordinates (debounced, reusing the geocode
  // cache) and recompute the estimate — shown before the customer confirms.
  useEffect(() => {
    const pickup = values.pickup.trim();
    const drop = values.drop.trim();
    setFareUnavailable(false);
    if (pickup.length < 3 || drop.length < 3 || !values.vehicleId) {
      setFareEstimate(null);
      return;
    }
    let cancelled = false;
    setFareLoading(true);
    const t = setTimeout(async () => {
      const [pickupLoc, dropLoc] = await Promise.all([
        resolvePickupLoc(pickup),
        geocodeAddress(drop),
      ]);
      if (cancelled) return;
      if (pickupLoc && dropLoc) {
        setFareEstimate(estimateFare(values.vehicleId, pickupLoc, dropLoc));
      } else {
        setFareEstimate(null);
        setFareUnavailable(true);
      }
      setFareLoading(false);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [values.pickup, values.drop, values.vehicleId]);

  function set<K extends keyof BookingInput>(key: K, value: BookingInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function useCurrentLocation() {
    setGpsError("");
    if (!("geolocation" in navigator)) {
      setGpsError("GPS is not available. You can still search your pickup address above.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        set("pickup", `Current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
        setGpsLoading(false);
      },
      () => {
        setGpsError("Location permission is off. You can still search your pickup address above.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateBooking(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const pickup = values.pickup.trim();
    const drop = values.drop.trim();

    setSubmitting(true);
    // Resolve real coordinates before saving. Never fabricated: either the
    // device's own GPS fix, an OSM geocoding match, or null if neither works.
    const [pickupLoc, dropLoc] = await Promise.all([
      resolvePickupLoc(pickup),
      geocodeAddress(drop),
    ]);

    const finalFare =
      pickupLoc && dropLoc ? estimateFare(values.vehicleId, pickupLoc, dropLoc) : null;

    const booking: Booking = {
      ...values,
      pickup,
      drop,
      name: values.name.trim(),
      notes: values.notes.trim(),
      id: generateBookingId(),
      createdAt: new Date().toISOString(),
      pickupLoc,
      dropLoc,
      distanceKm: finalFare?.distanceKm ?? null,
      estimatedFare: finalFare?.fare ?? null,
    };
    const saved = await saveBooking(booking);
    if (!saved) {
      setSubmitting(false);
      setSubmitError("Couldn't save your booking. Please check your connection and try again.");
      return;
    }
    rememberRecentBookingId(saved.id);
    router.push(`/booking/${saved.id}/confirmed`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
      <div className="flex-1 px-6 pt-8">
        {/* Pickup */}
        <div className="relative pl-9">
          <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-brand" />
          <span className="absolute left-[9px] top-7 -bottom-8 border-l-2 border-dashed border-gray-300" />
          <span className="block text-sm font-medium text-gray-500">Pickup location</span>
          <div className="flex items-center gap-3">
            <input
              className={underline}
              placeholder="Search address or use GPS"
              value={values.pickup}
              onChange={(e) => set("pickup", e.target.value)}
              autoComplete="off"
              maxLength={120}
            />
            <button
              type="button"
              onClick={useCurrentLocation}
              aria-label="Use current location"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-base active:bg-gray-200"
            >
              {gpsLoading ? (
                "…"
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              )}
            </button>
          </div>
          <Err text={errors.pickup} />
          {gpsError && (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {gpsError}
            </p>
          )}
        </div>

        {/* Drop */}
        <div className="relative mt-8 pl-9">
          <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-navy" />
          <span className="block text-sm font-medium text-gray-500">Drop location</span>
          <input
            className={underline}
            placeholder="Enter drop location"
            value={values.drop}
            onChange={(e) => set("drop", e.target.value)}
            autoComplete="off"
            maxLength={120}
          />
          <Err text={errors.drop} />
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Currently serving Jamshedpur &amp; Adityapur only
        </p>

        {/* Map placeholder (real OpenStreetMap comes in a later step) */}
        <div className="map-placeholder relative mt-5 flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-gray-200">
          <span className="max-w-[210px] rounded-full bg-white/95 px-5 py-3 text-center text-xs text-navy shadow">
            Select pickup and drop to see your route
          </span>
        </div>


        {/* Vehicle */}
        <div className="mt-10">
          <span className="mb-3 block text-sm font-medium text-gray-500">Vehicle type</span>
          <div className="flex flex-col gap-2.5">
            {VEHICLES.map((v) => {
              const selected = values.vehicleId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => set("vehicleId", v.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    selected ? "border-brand bg-orange-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <span className="text-2xl">{v.emoji}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-navy">{v.name}</span>
                    <span className="block text-xs text-gray-500">{v.size}</span>
                  </span>
                  <span
                    className={`h-5 w-5 rounded-full border-2 ${
                      selected ? "border-brand bg-brand ring-2 ring-inset ring-white" : "border-gray-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <Err text={errors.vehicleId} />
        </div>

        {/* Fare estimate — shown before the customer confirms the booking */}
        {(fareLoading || fareEstimate || fareUnavailable) && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
            {fareLoading ? (
              <p className="text-sm text-gray-400">Calculating estimated fare…</p>
            ) : fareEstimate ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Estimated fare</span>
                  <span className="text-lg font-bold text-navy">₹{fareEstimate.fare}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  ~{fareEstimate.distanceKm} km · test estimate, actual fare may vary
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Couldn&apos;t estimate a fare for these addresses yet — you can still book, and
                the driver will confirm the final price.
              </p>
            )}
          </div>
        )}

        {/* Customer */}
        <div className="mt-10 space-y-7 pb-10">
          <div>
            <span className="block text-sm font-medium text-gray-500">Your name</span>
            <input
              className={underline}
              placeholder="Full name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name"
              maxLength={60}
            />
            <Err text={errors.name} />
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-500">Mobile number</span>
            <div className="flex items-center gap-2">
              <span className="border-b-2 border-gray-200 py-2.5 text-base text-gray-500">+91</span>
              <input
                className={underline}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit number"
                value={values.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))}
                autoComplete="tel-national"
              />
            </div>
            <Err text={errors.mobile} />
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-500">Notes (optional)</span>
            <textarea
              className={underline}
              rows={2}
              placeholder="Floor, lift, items, landmark..."
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={300}
            />
            <Err text={errors.notes} />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 rounded-b-none border-t border-gray-100 bg-white p-4">
        {submitError && <p className="mb-3 text-sm text-red-600">{submitError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark disabled:opacity-60"
        >
          {submitting ? "Locating addresses…" : "Book Now"}
        </button>
      </div>
    </form>
  );
}
