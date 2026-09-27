"use client";

import { useEffect, useState, type ReactNode } from "react";

const SPLASH_FLAG = "carrycub_splash_seen_v1";

const FADE_IN_MS = 600;
const HOLD_MS = 1200;
const EXIT_MS = 300;
const TOTAL_MS = FADE_IN_MS + HOLD_MS;

export default function SplashOverlay({ children }: { children: ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const alreadySeen =
      window.sessionStorage.getItem(SPLASH_FLAG) === "1";
    window.sessionStorage.setItem(SPLASH_FLAG, "1");

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (alreadySeen) {
      const t1 = setTimeout(() => setLeaving(true), 50);
      const t2 = setTimeout(() => setGone(true), 50 + EXIT_MS);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    if (prefersReducedMotion) {
      const t1 = setTimeout(() => setLeaving(true), 700);
      const t2 = setTimeout(() => setGone(true), 700 + EXIT_MS);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    const t1 = setTimeout(() => setLeaving(true), TOTAL_MS);
    const t2 = setTimeout(() => setGone(true), TOTAL_MS + EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <>
      {children}
      {!gone && (
        <div className={`carrycub-splash-root ${leaving ? "carrycub-splash-leave" : ""}`}>
          <img
            className="carrycub-splash-logo"
            src="/carrycub-truck-marker.png"
            alt="CarryCub"
          />
        </div>
      )}
    </>
  );
}
