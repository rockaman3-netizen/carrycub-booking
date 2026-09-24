"use client";

import { useEffect, useRef, useState } from "react";

// How often we send a new position, at most. Each send is a call to
// Apps Script (slow), so we keep this modest.
const MIN_UPDATE_INTERVAL_MS = 8000;
// If no position arrives for this long while the screen is visible,
// restart the GPS watch (Android sometimes silently stops it).
const STALL_MS = 25000;

type WakeLockLike = { release: () => Promise<void> };
type WakeLockNav = {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
};

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
 *
 * While sharing it also keeps the screen awake (Wake Lock) and restarts the
 * GPS watch whenever the app comes back to the foreground, because browsers
 * pause geolocation when the page is minimised.
 */
export function useDriverLocationShare(
  active: boolean,
  onUpdate: (lat: number, lng: number) => void | Promise<void>,
): GeoShareStatus {
  const [status, setStatus] = useState<GeoShareStatus>("idle");
  const lastWriteRef = useRef(0);
  const inFlightRef = useRef(false);
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

    let cancelled = false;
    let denied = false;
    let watchId: number | null = null;
    let wakeLock: WakeLockLike | null = null;
    let lastFixAt = Date.now();

    const acquireWakeLock = async () => {
      try {
        const wl = (navigator as unknown as WakeLockNav).wakeLock;
        if (!wl || document.hidden) return;
        const lock = await wl.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        wakeLock = lock;
      } catch {
        /* wake lock not supported or refused; sharing still works */
      }
    };

    const onPosition = (pos: GeolocationPosition) => {
      lastFixAt = Date.now();
      setStatus("sharing");
      const now = Date.now();
      if (now - lastWriteRef.current < MIN_UPDATE_INTERVAL_MS) return;
      if (inFlightRef.current) return; // previous send still running
      lastWriteRef.current = now;
      inFlightRef.current = true;
      const { latitude, longitude } = pos.coords;
      void (async () => {
        try {
          await onUpdateRef.current(latitude, longitude);
        } catch {
          /* one failed send is fine; the next fix retries */
        } finally {
          inFlightRef.current = false;
        }
      })();
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        denied = true;
        setStatus("denied");
      } else {
        setStatus("unavailable"); // POSITION_UNAVAILABLE or TIMEOUT
      }
    };

    const stopWatch = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const startWatch = () => {
      stopWatch();
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 15000,
      });
    };

    // Coming back to the app: restart GPS + re-take the wake lock
    // (the browser drops both while the page is hidden).
    const onVisibility = () => {
      if (document.hidden || denied) return;
      lastWriteRef.current = 0; // send a fresh position right away
      lastFixAt = Date.now();
      startWatch();
      void acquireWakeLock();
    };

    // Safety net: if GPS goes quiet while the screen is on, restart it.
    const watchdog = setInterval(() => {
      if (document.hidden || denied) return;
      if (Date.now() - lastFixAt > STALL_MS) {
        lastFixAt = Date.now();
        startWatch();
      }
    }, 10000);

    startWatch();
    void acquireWakeLock();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
      if (wakeLock) void wakeLock.release().catch(() => {});
    };
  }, [active]);

  return status;
}
