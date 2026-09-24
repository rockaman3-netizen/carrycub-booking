"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveBooking } from "@/lib/store";
import { rememberRecentBookingId } from "@/lib/recent-bookings";
import { VEHICLES } from "@/lib/vehicles";
import { geocodeAddress, parseCurrentLocationString, type LatLng } from "@/lib/geocode";
import { estimateFare, type FareEstimate } from "@/lib/fare";
import {
  generateBookingId,
  validateBooking,
  type Booking,
  type BookingErrors,
  type BookingInput,
} from "@/lib/booking";

// Leaflet touches window/document, so it must never run during SSR.
const TrackingMap = dynamic(() => import("@/components/TrackingMap"), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-2xl border border-gray-200 bg-gray-100" />,
});

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
  "w-full min-w-0 border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-base outline-none placeholder:text-gray-400 focus:border-brand";

function Err({ text }: { text?: string }) {
  return text ? <span className="mt-1 block text-sm text-red-600">{text}</span> : null;
}

const STEPS = [
  { n: 1, label: "Location" },
  { n: 2, label: "Vehicle" },
  { n: 3, label: "Your details" },
] as const;

// Which BookingInput keys belong to each step — used to validate only the
// fields visible on that step, so the customer only ever sees errors for
// what's in front of them.
const STEP_FIELDS: Record<number, (keyof BookingInput)[]> = {
  1: ["pickup", "drop"],
  2: ["vehicleId"],
  3: ["name", "mobile", "notes"],
};

function StepHeader({ step }: { step: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 px-1">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex flex-1 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
              s.n < step
                ? "bg-brand text-white"
                : s.n === step
                ? "bg-brand text-white ring-4 ring-orange-100"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {s.n < step ? "✓" : s.n}
          </div>
          <span
            className={`hidden text-xs font-medium sm:block ${
              s.n === step ? "text-navy" : "text-gray-400"
            }`}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 flex-1 rounded ${s.n < step ? "bg-brand" : "bg-gray-100"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function BookingForm() {
  const [values, setValues] = useState<BookingInput>(EMPTY);
  const [errors, setErrors] = useState<BookingErrors>({});
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareUnavailable, setFareUnavailable] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [mapPickup, setMapPickup] = useState<LatLng | null>(null);
  const [mapDrop, setMapDrop] = useState<LatLng | null>(null);

  // Step-1 map: plot pickup / drop as soon as each address resolves to real
  // coordinates (debounced; results are cached, so the fare preview and the
  // final submit reuse them instead of hitting OpenStreetMap again).
  useEffect(() => {
    const text = values.pickup.trim();
    if (text.length < 3) {
      setMapPickup(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const loc = await resolvePickupLoc(text);
      if (!cancelled) setMapPickup(loc);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [values.pickup]);

  useEffect(() => {
    const text = values.drop.trim();
    if (text.length < 3) {
      setMapDrop(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const loc = await geocodeAddress(text);
      if (!cancelled) setMapDrop(loc);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [values.drop]);

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

  // Validate only the current step's fields, show those errors, and move
  // forward if there are none. Keeps the customer from being blocked by
  // errors on a screen they haven't reached yet.
  function goNext() {
    const found = validateBooking(values);
    const relevant = STEP_FIELDS[step];
    const stepErrors: BookingErrors = {};
    for (const key of relevant) {
      if (found[key]) stepErrors[key] = found[key];
    }
    setErrors((e) => ({ ...e, ...stepErrors, ...Object.fromEntries(relevant.filter((k) => !stepErrors[k]).map((k) => [k, undefined])) }));
    if (Object.keys(stepErrors).length > 0) return;
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    // Guard against Enter-key submits from earlier steps (there's no
    // type="submit" button until step 3, but pressing Enter in a text
    // input still fires the form's submit event) — just advance instead.
    if (step < 3) {
      goNext();
      return;
    }
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
      <div className="flex-1 px-5 pt-5">
        <StepHeader step={step} />

        {/* ───────── Step 1: Location ───────── */}
        {step === 1 && (
        <>
        <div className="relative pl-7">
          <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full bg-brand" />
          <span className="absolute left-[6px] top-6 -bottom-8 border-l-2 border-dashed border-gray-300" />
          <span className="block text-[13px] font-medium text-gray-500">Pickup location</span>
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
        <div className="relative mt-5 pl-7">
          <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full bg-navy" />
          <span className="block text-[13px] font-medium text-gray-500">Drop location</span>
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

        <p className="mt-4 text-xs text-gray-400">
          Currently serving Jamshedpur &amp; Adityapur only
        </p>

        {/* Real OpenStreetMap: pickup / drop pins appear as the addresses resolve */}
        <div className="mt-3">
          <TrackingMap
            pickup={mapPickup}
            drop={mapDrop}
            emptyText={null}
            className="relative isolate h-44 overflow-hidden rounded-2xl border border-gray-200"
          />
          {!(mapPickup && mapDrop) && (
            <p className="mt-2 text-center text-xs text-gray-500">
              Select pickup and drop to see your route
            </p>
          )}
        </div>
        </>
        )}

        {/* ───────── Step 2: Vehicle ───────── */}
        {step === 2 && (
        <div className="pb-4">
          <span className="mb-3 block text-[13px] font-medium text-gray-500">Vehicle type</span>
          <div className="flex flex-col gap-2.5">
            {VEHICLES.map((v) => {
              const selected = values.vehicleId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => set("vehicleId", v.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition ${
                    selected ? "border-brand bg-orange-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <Image
                    src={v.image}
                    alt={v.name}
                    width={72}
                    height={54}
                    className="h-12 w-16 shrink-0 rounded-lg object-contain"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy">{v.name}</span>
                    <span className="block text-xs text-gray-500">
                      {v.size} · {v.capacity}
                    </span>
                  </span>
                  <span
                    className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                      selected ? "border-brand bg-brand ring-2 ring-inset ring-white" : "border-gray-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <Err text={errors.vehicleId} />

        {/* Fare estimate — shown before the customer confirms the booking */}
        {(fareLoading || fareEstimate || fareUnavailable) && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
            {fareLoading ? (
              <p className="text-sm text-gray-400">Calculating estimated fare…</p>
            ) : fareEstimate ? (
              <>
                <div className="flex items-center justify-between gap-3">
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
        </div>
        )}

        {/* ───────── Step 3: Customer details ───────── */}
        {step === 3 && (
        <div className="space-y-4 pb-6">
          <div>
            <span className="block text-[13px] font-semibold text-gray-700">Your name</span>
            <input
              className={`${underline} font-medium text-navy`}
              placeholder="Full name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="name"
              maxLength={60}
            />
            <Err text={errors.name} />
          </div>

          <div>
            <span className="block text-[13px] font-semibold text-gray-700">Mobile number</span>
            <div className="flex items-center gap-2">
              <span className="shrink-0 border-b-2 border-gray-200 py-2 text-base font-medium text-gray-700">+91</span>
              <input
                className={`${underline} font-medium text-navy`}
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
            <span className="block text-[13px] font-semibold text-gray-700">Notes (optional)</span>
            <textarea
              className={`${underline} font-medium text-navy`}
              rows={2}
              placeholder="Floor, lift, items, landmark..."
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={300}
            />
            <Err text={errors.notes} />
          </div>
        </div>
        )}
      </div>

      <div className="sticky bottom-0 rounded-b-none border-t border-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {submitError && <p className="mb-3 text-sm text-red-600">{submitError}</p>}
        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="shrink-0 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-base font-semibold text-navy active:bg-gray-50"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white active:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Locating addresses…" : "Book Now"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
