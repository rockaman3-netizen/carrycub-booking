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

function driverPinHtml() {
  return `
    <div style="position:relative;width:26px;height:26px;">
      <span style="position:absolute;inset:0;border-radius:9999px;background:#f97316;
        opacity:.35;animation:cc-pulse 1.6s ease-out infinite;"></span>
      <span style="position:absolute;left:5px;top:5px;width:16px;height:16px;border-radius:9999px;
        background:#f97316;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
    </div>
    <style>@keyframes cc-pulse{0%{transform:scale(.6);opacity:.6}70%{transform:scale(2);opacity:0}100%{opacity:0}}</style>`;
}

// Jamshedpur city centre — only ever used as the *initial camera position*
// before any real point is known. It is never used as a stand-in for a
// pickup, drop, or driver location.
const FALLBACK_CENTER: [number, number] = [22.8046, 86.2029];

export default function TrackingMap({ pickup, drop, driver, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<{ pickup?: Marker; drop?: Marker; driver?: Marker }>({});

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
    place("driver", driver, driverPinHtml(), [26, 26], [13, 13], 1000);

    if (!bounds.isValid()) return; // nothing real to show yet — leave fallback view

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (ne.equals(sw)) {
      map.setView(ne, Math.max(map.getZoom(), 15));
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
  }

  const hasAnyPoint = Boolean(pickup || drop || driver);

  return (
    <div className={className ?? "relative h-56 overflow-hidden rounded-2xl border border-gray-200"}>
      <div ref={containerRef} className="h-full w-full" />
      {!hasAnyPoint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 px-6 text-center text-xs text-gray-500">
          Map will show pickup, drop, and the driver&apos;s live location once available.
        </div>
      )}
    </div>
  );
}
