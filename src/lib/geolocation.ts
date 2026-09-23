"use client";

import { useEffect, useRef, useState } from "react";

// How often we write a new position to the store, at most.
// watchPosition can fire much more often than this; we throttle writes
// so we don't hammer localStorage / the "storage" event on every tick.
const MIN_UPDATE_INTERVAL_MS = 5000;

export type GeoShareStatus =
  | "idle" // not currently supposed to be sharing (booking not active / not this driver)
  | "requesting" // waiting on the browser permission prompt / first fix
  | "sharing" // actively getting positions
  | "denied" // user denied location permission
  | "unavailable" // permission granted but no position could be determined, or timed out
  | "unsupported"; // this browser has no geolocation API

/**
 * Starts (and cleans up) real browser GPS sharing for as long as `active` is true.
 * Calls `onUpdate(lat, lng)` with real device coordinates, throttled to
 * MIN_UPDATE_INTERVAL_MS. Never invents or fakes a location — if the browser
 * can't produce one, onUpdate simply isn't called and status reflects why.
 */
export function useDriverLocationShare(
  active: boolean,
  onUpdate: (lat: number, lng: number) => void,
): GeoShareStatus {
  const [status, setStatus] = useState<GeoShareStatus>("idle");
  const lastWriteRef = useRef(0);
  // keep the latest callback without re-subscribing watchPosition on every render
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!active) {
      setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    lastWriteRef.current = 0; // allow an immediate first write

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("sharing");
        const now = Date.now();
        if (now - lastWriteRef.current < MIN_UPDATE_INTERVAL_MS) return;
        lastWriteRef.current = now;
        onUpdateRef.current(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else setStatus("unavailable"); // POSITION_UNAVAILABLE or TIMEOUT
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);

  return status;
}
