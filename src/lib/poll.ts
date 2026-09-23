"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `load` immediately and then every `intervalMs` while the component is
 * mounted. Used everywhere the UI needs to reflect changes made elsewhere
 * (another device, the admin panel, a driver's phone) since Google Sheets
 * has no push/subscribe API — polling is the simple, good-enough substitute
 * for the old same-device "storage" event trick.
 */
export function usePolling(load: () => void | Promise<void>, deps: unknown[], intervalMs = 4000) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void loadRef.current();
    };
    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
