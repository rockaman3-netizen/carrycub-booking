"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";

export type LatLng = { lat: number; lng: number };

type Props = {
  /** Real geocoded pickup point, or null/undefined if unresolved. */
  pickup?: LatLng | null;
  /** Real geocoded drop point, or null/undefined if unresolved. */
  drop?: LatLng | null;
  /** Driver's real live GPS position, updated as new fixes arrive. */
  driver?: LatLng | null;
  className?: string;
  /** Overlay text while no point is known. Pass null to show the bare map instead. */
  emptyText?: string | null;
};

function pinHtml(color: string, label: string) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <span style="width:16px;height:16px;border-radius:9999px;background:${color};
        border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:block;"></span>
      <span style="margin-top:3px;padding:1px 6px;border-radius:6px;background:#fff;
        font:600 10px/1.4 system-ui,sans-serif;color:#0b1b3f;box-shadow:0 1px 3px rgba(0,0,0,.2);
        white-space:nowrap;">${label}</span>
    </div>`;
}

// The driver is drawn as the CarryCub truck (faces right by default; flipped
// when heading west). The white halo keeps it readable on any map tile.
function driverPinHtml() {
  return `<img class="cc-truck" src="/carrycub-truck-marker.png" alt="" draggable="false"
    style="display:block;width:64px;height:auto;pointer-events:none;transform-origin:50% 50%;
    transition:transform .25s ease;
    filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 1px 3px rgba(0,0,0,.45));" />`;
}

// How long the truck glides between two GPS fixes. Fixes arrive every ~4-9s
// (driver writes every 5s, tracking polls every 4s), so a 4s glide reads as
// continuous movement instead of a jump.
const GLIDE_MS = 4000;

// Jamshedpur city centre — only ever used as the *initial camera position*
// before any real point is known. It is never used as a stand-in for a
// pickup, drop, or driver location.
const FALLBACK_CENTER: [number, number] = [22.8046, 86.2029];

export default function TrackingMap({ pickup, drop, driver, className, emptyText }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<{ pickup?: Marker; drop?: Marker; driver?: Marker }>({});
  const glideRef = useRef<number>(0);
  const fitKeyRef = useRef<string>("");

  // Initialize the map once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false, // don't hijack page scroll on trackpads
      }).setView(FALLBACK_CENTER, 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapRef.current = map;
      syncMarkers(L);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(glideRef.current);
      fitKeyRef.current = "";
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
    // Intentionally only on mount/unmount — point updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add/move markers whenever a point changes, and reframe the view.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!cancelled) syncMarkers(L);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, driver?.lat, driver?.lng]);

  function syncMarkers(L: typeof import("leaflet")) {
    const map = mapRef.current;
    if (!map) return;

    const bounds = L.latLngBounds([]);

    function place(
      key: "pickup" | "drop" | "driver",
      point: LatLng | null | undefined,
      html: string,
      size: [number, number],
      anchor: [number, number],
      zIndexOffset: number,
    ) {
      if (!point || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
        markersRef.current[key]?.remove();
        markersRef.current[key] = undefined;
        return;
      }
      const latlng = L.latLng(point.lat, point.lng);
      bounds.extend(latlng);
      const existing = markersRef.current[key];
      if (existing) {
        existing.setLatLng(latlng); // move the same marker — no flicker/recreate
      } else {
        const icon = L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });
        markersRef.current[key] = L.marker(latlng, { icon, zIndexOffset }).addTo(map!);
      }
    }

    place("pickup", pickup, pinHtml("#f97316", "Pickup"), [80, 40], [40, 34], 0);
    place("drop", drop, pinHtml("#0b1b3f", "Drop"), [80, 40], [40, 34], 0);
    if (driver && !Number.isNaN(driver.lat) && !Number.isNaN(driver.lng)) {
      bounds.extend(L.latLng(driver.lat, driver.lng));
    }
    placeDriver(L, driver);

    if (!bounds.isValid()) return; // nothing real to show yet — leave fallback view

    // Reframe when the pickup/drop set changes or the driver first appears —
    // and while gliding, only if the truck drifts out of view. Re-fitting on
    // every GPS fix would make the map jump around under a moving truck.
    const fitKey = [pickup, drop].map((p) => (p ? `${p.lat},${p.lng}` : "-")).join("|") + (driver ? "|D" : "");
    const driverOffscreen =
      driver && !map.getBounds().contains(L.latLng(driver.lat, driver.lng));
    if (fitKey === fitKeyRef.current && !driverOffscreen) return;
    fitKeyRef.current = fitKey;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (ne.equals(sw)) {
      map.setView(ne, Math.max(map.getZoom(), 15));
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
  }

  // Create the truck at its first fix; afterwards glide it to each new fix.
  function placeDriver(L: typeof import("leaflet"), point: LatLng | null | undefined) {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current.driver;

    if (!point || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
      cancelAnimationFrame(glideRef.current);
      existing?.remove();
      markersRef.current.driver = undefined;
      return;
    }

    const to = L.latLng(point.lat, point.lng);
    if (!existing) {
      const icon = L.divIcon({ html: driverPinHtml(), className: "", iconSize: [64, 44], iconAnchor: [32, 30] });
      markersRef.current.driver = L.marker(to, { icon, zIndexOffset: 1000, interactive: false }).addTo(map);
      return;
    }

    const from = existing.getLatLng();
    const dist = from.distanceTo(to);
    if (dist < 1) return; // same fix as before
    cancelAnimationFrame(glideRef.current);

    // Face the direction of travel (image faces right; flip when heading west).
    const img = existing.getElement()?.querySelector<HTMLImageElement>(".cc-truck");
    if (img && Math.abs(to.lng - from.lng) > 1e-6) {
      img.style.transform = to.lng < from.lng ? "scaleX(-1)" : "scaleX(1)";
    }

    if (dist > 3000) {
      existing.setLatLng(to); // huge jump (e.g. GPS reacquired) — don't glide across the city
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      existing.setLatLng(L.latLng(from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t));
      if (t < 1) glideRef.current = requestAnimationFrame(step);
    };
    glideRef.current = requestAnimationFrame(step);
  }

  const hasAnyPoint = Boolean(pickup || drop || driver);

  return (
    <div className={className ?? "relative isolate h-56 overflow-hidden rounded-2xl border border-gray-200"}>
      <div ref={containerRef} className="h-full w-full" />
      {!hasAnyPoint && emptyText !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 px-6 text-center text-xs text-gray-500">
          {emptyText ?? "Map will show pickup, drop, and the driver's live location once available."}
        </div>
      )}
    </div>
  );
}
