"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveBooking } from "@/lib/store";
import { rememberRecentBookingId } from "@/lib/recent-bookings";
import { VEHICLES } from "@/lib/vehicles";
import {
  geocodeAddress,
  parseCurrentLocationString,
  searchAddressSuggestions,
  type LatLng,
  type AddressSuggestion,
} from "@/lib/geocode";
import { estimateFare } from "@/lib/fare";
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

// Nominatim's display_name is very long (e.g. "Road, Locality, City,
// District, State, PIN, Country"). Keep only the first few comma-separated
// parts so the field stays short and readable, and fits the form's
// validation length — the exact coordinates are captured separately
// regardless of how much of the label we keep.
function shortenAddress(label: string, parts = 3): string {
  return label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, parts)
    .join(", ");
}

// Demo-only ETA shown next to each vehicle in the list, purely cosmetic
// (like Porter/Ola's "20 mins"). Not derived from any real dispatch data.
const DUMMY_ETA_MINS: Record<string, number> = {
  "3-wheeler-tempo": 15,
  "tata-ace-7ft": 20,
  "9-ft-pickup": 18,
  "10-ft-pickup": 19,
  "14-ft-lpt": 25,
};

const EMPTY: BookingInput = {
  pickup: "",
  drop: "",
  vehicleId: "",
  name: "",
  mobile: "",
  notes: "",
};

// Value text inside a field card: no underline, darker/bolder than a normal
// placeholder so filled-in addresses and details stand out clearly.
const underline =
  "w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold text-navy outline-none placeholder:font-normal placeholder:text-gray-400";

function Err({ text }: { text?: string }) {
  return text ? <span className="mt-1 block text-sm text-red-600">{text}</span> : null;
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-gray-300"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

const STEPS = [1, 2, 3] as const;

// Which BookingInput keys belong to each step — used to validate only the
// fields visible on that step, so the customer only ever sees errors for
// what's in front of them.
const STEP_FIELDS: Record<number, (keyof BookingInput)[]> = {
  1: ["pickup", "drop"],
  2: ["vehicleId"],
  3: ["name", "mobile", "notes"],
};

// Fixed-width connectors so the 1–2–3 indicator is perfectly symmetric and
// sits dead-center regardless of which step is active.
function StepHeader({ step }: { step: number }) {
  return (
    <div className="mb-4 flex items-center justify-center">
      {STEPS.map((n, i) => (
        <div key={n} className="flex items-center">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
              n < step
                ? "bg-brand text-white"
                : n === step
                ? "bg-brand text-white ring-4 ring-orange-100"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {n < step ? "✓" : n}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-2 h-0.5 w-10 rounded ${n < step ? "bg-brand" : "bg-gray-100"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// Shared autocomplete dropdown for the pickup/drop fields. Debounces the
// query, shows up to 5 real OSM suggestions, and lets the customer tap one
// to fill the field with its exact coordinates (skipping a second geocode
// lookup for that address later).
function AddressField({
  value,
  onChange,
  onSelectSuggestion,
  placeholder,
  error,
  rightSlot,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelectSuggestion: (s: AddressSuggestion) => void;
  placeholder: string;
  error?: string;
  rightSlot?: React.ReactNode;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = value.trim();
    // Don't show suggestions for the special GPS string.
    if (text.length < 3 || parseCurrentLocationString(text)) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const results = await searchAddressSuggestions(text);
      if (!cancelled) {
        setSuggestions(results);
        setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  // Close the dropdown on outside tap.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showDropdown = open && value.trim().length >= 3 && (loading || suggestions.length > 0);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-3">
        <input
          className={underline}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          maxLength={120}
        />
        {rightSlot}
      </div>
      <Err text={error} />

      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white py-1 shadow-lg">
          {loading && suggestions.length === 0 && (
            <p className="px-4 py-2.5 text-sm text-gray-400">Searching…</p>
          )}
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat}-${s.lng}-${i}`}
              type="button"
              onClick={() => {
                onSelectSuggestion(s);
                setOpen(false);
              }}
              className="block w-full truncate px-4 py-2.5 text-left text-sm text-navy active:bg-gray-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
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
  const [submitError, setSubmitError] = useState("");
  const [mapPickup, setMapPickup] = useState<LatLng | null>(null);
  const [mapDrop, setMapDrop] = useState<LatLng | null>(null);

  // Step-1 map: plot pickup / drop as soon as each address resolves to real
  // coordinates (debounced; results are cached, so the per-vehicle fare
  // list and the final submit reuse them instead of hitting OpenStreetMap
  // again).
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

  const routeReady = mapPickup !== null && mapDrop !== null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
      <div className="flex-1 px-5 pt-5">
        <StepHeader step={step} />

        {/* ───────── Step 1: Location ───────── */}
        {step === 1 && (
        <>
        <div className="space-y-3">
          {/* Pickup */}
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-gray-700">Pickup location</span>
                <AddressField
                  value={values.pickup}
                  onChange={(text) => set("pickup", text)}
                  onSelectSuggestion={(s) => {
                    set("pickup", shortenAddress(s.label));
                    setMapPickup({ lat: s.lat, lng: s.lng });
                  }}
                  placeholder="Search address or use GPS"
                  error={errors.pickup}
                  rightSlot={
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
                  }
                />
              </div>
            </div>
          </div>
          {gpsError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {gpsError}
            </p>
          )}

          {/* Drop */}
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy">
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-gray-700">Drop location</span>
                <AddressField
                  value={values.drop}
                  onChange={(text) => set("drop", text)}
                  onSelectSuggestion={(s) => {
                    set("drop", shortenAddress(s.label));
                    setMapDrop({ lat: s.lat, lng: s.lng });
                  }}
                  placeholder="Enter drop location"
                  error={errors.drop}
                />
              </div>
              <ChevronIcon />
            </div>
          </div>
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
          {!routeReady && (
            <p className="mt-2 text-center text-xs text-gray-500">
              Select pickup and drop to see your route
            </p>
          )}
        </div>
        </>
        )}

        {/* ───────── Step 2: Vehicle ───────── */}
        {step === 2 && (
        <div className="pb-10">
          <span className="mb-3 block text-[13px] font-medium text-gray-500">Vehicle type</span>
          <div className="flex flex-col gap-1.5">
            {VEHICLES.map((v) => {
              const selected = values.vehicleId === v.id;
              const fare = routeReady ? estimateFare(v.id, mapPickup!, mapDrop!) : null;
              const eta = DUMMY_ETA_MINS[v.id] ?? 20;
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
                      {v.capacity} · {eta} mins
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm font-bold text-navy">
                      {fare ? `₹${fare.fare}` : "—"}
                    </span>
                    <span
                      className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                        selected ? "border-brand bg-brand ring-2 ring-inset ring-white" : "border-gray-300"
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>
          <Err text={errors.vehicleId} />

          {!routeReady && (
            <p className="mt-3 text-center text-xs text-gray-400">
              We&apos;ll show exact fares once your pickup &amp; drop are located — you can still
              book, and the driver will confirm the price.
            </p>
          )}
        </div>
        )}

        {/* ───────── Step 3: Customer details ───────── */}
        {step === 3 && (
        <div className="space-y-3 pb-6">
          {/* Name */}
