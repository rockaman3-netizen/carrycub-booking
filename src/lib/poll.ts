"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `load` immediately and then every `intervalMs` while the component is
 * mounted. Used everywhere the UI needs to reflect changes made elsewhere.
 *
 * - Skips a tick while the previous request is still running (so slow
 *   requests never pile up).
 * - Pauses while the tab/app is in the background and refreshes right away
 *   when the person comes back.
 */
export function usePolling(load: () => void | Promise<void>, deps: unknown[], intervalMs = 4000) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    let running = false;

    const run = async () => {
      if (cancelled || running) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running = true;
      try {
        await loadRef.current();
      } catch {
        /* a failed poll is retried on the next tick */
      } finally {
        running = false;
      }
    };

    run();
    const timer = setInterval(run, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
