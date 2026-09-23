"use client";

import { useEffect } from "react";

// One service worker at the origin root (scope "/") covers both the
// customer app and the /driver app — same-origin, so a single
// registration is enough. See public/sw.js for what it actually caches.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail (e.g. served over plain HTTP in some local
      // setups) — the app works fine without it, just without
      // install/offline support, so this is silently non-fatal.
    });
  }, []);

  return null;
}
