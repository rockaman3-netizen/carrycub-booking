"use client";

import { useEffect, useState, type ReactNode } from "react";

const SPLASH_FLAG = "carrycub_splash_seen_v1";

const FADE_IN_MS = 600; // 0 – 600ms: logo fades + scales in
const HOLD_MS = 1200; // 600 – 1800ms: logo sits still, fully visible, gentle breathing
const EXIT_MS = 300; // fade-out duration
const TOTAL_MS = FADE_IN_MS + HOLD_MS; // 1800ms visible before exit starts

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
        <div className={`splash-root ${leaving ? "splash-leave" : ""}`}>
          <img
            className="splash-logo"
            src="/carrycub-truck-marker.png"
            alt="CarryCub"
          />
          <style jsx>{`
            .splash-root {
              position: fixed;
              inset: 0;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #ffffff;
              opacity: 1;
              transition: opacity ${EXIT_MS}ms ease;
            }
            .splash-root.splash-leave {
              opacity: 0;
              pointer-events: none;
            }
            .splash-logo {
              width: min(50vw, 300px);
              height: auto;
              opacity: 0;
              transform: scale(0.9);
              animation: fadeInLogo ${FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards,
                breathe 2600ms ease-in-out ${FADE_IN_MS}ms infinite;
            }

            @keyframes fadeInLogo {
              to {
                opacity: 1;
                transform: scale(1);
              }
            }

            @keyframes breathe {
              0%,
              100% {
                transform: scale(1);
              }
              50% {
                transform: scale(1.015);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .splash-logo {
                animation: none !important;
                opacity: 1;
                transform: none;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
