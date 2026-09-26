"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const SPLASH_FLAG = "carrycub_splash_seen_v1";

const FADE_SCALE_IN_MS = 500; // 0 – 500ms
const WIPE_MS = 900; // 500 – 1400ms
const SETTLE_MS = 600; // 1400 – 2000ms
const EXIT_MS = 300; // 2000 – 2300ms
const TOTAL_MS = FADE_SCALE_IN_MS + WIPE_MS + SETTLE_MS; // 2000ms

export default function SplashOverlay({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);

    const alreadySeen =
      window.sessionStorage.getItem(SPLASH_FLAG) === "1";
    if (alreadySeen) return; // don't show splash again this session

    window.sessionStorage.setItem(SPLASH_FLAG, "1");

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    setVisible(true);

    if (prefersReducedMotion) {
      timers.current.push(setTimeout(() => setVisible(false), 400));
      return () => timers.current.forEach(clearTimeout);
    }

    timers.current.push(
      setTimeout(() => setLeaving(true), TOTAL_MS),
      setTimeout(() => setVisible(false), TOTAL_MS + EXIT_MS)
    );

    return () => timers.current.forEach(clearTimeout);
  }, []);

  return (
    <>
      {children}
      {mounted && visible && (
        <div className={`splash-root ${leaving ? "splash-leave" : ""}`}>
          <div className="splash-bg" role="img" aria-label="CarryCub" />
          <style jsx>{`
            .splash-root {
              position: fixed;
              inset: 0;
              z-index: 9999;
              overflow: hidden;
              background: #fdfdfd;
              opacity: 1;
              transition: opacity ${EXIT_MS}ms ease;
            }
            .splash-root.splash-leave {
              opacity: 0;
              pointer-events: none;
            }
            .splash-bg {
              position: absolute;
              inset: 0;
              background-image: url("/splash-bg.png");
              background-size: cover;
              background-position: center;
              background-repeat: no-repeat;

              opacity: 0;
              transform: scale(0.98);
              filter: brightness(1);

              -webkit-mask-image: linear-gradient(
                118deg,
                #000 0%,
                #000 40%,
                transparent 60%
              );
              mask-image: linear-gradient(
                118deg,
                #000 0%,
                #000 40%,
                transparent 60%
              );
              -webkit-mask-size: 340% 340%;
              mask-size: 340% 340%;
              -webkit-mask-position: 140% -40%;
              mask-position: 140% -40%;
              -webkit-mask-repeat: no-repeat;
              mask-repeat: no-repeat;

              animation: fadeScaleIn ${FADE_SCALE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards,
                routeWipe ${WIPE_MS}ms ease-in-out ${FADE_SCALE_IN_MS}ms forwards,
                settle ${SETTLE_MS}ms ease-in-out ${FADE_SCALE_IN_MS + WIPE_MS}ms forwards,
                sheen ${SETTLE_MS}ms ease-in-out ${FADE_SCALE_IN_MS + WIPE_MS}ms forwards;
            }

            /* 0 - 500ms: subtle fade + scale 98% -> 100% */
            @keyframes fadeScaleIn {
              to {
                opacity: 1;
                transform: scale(1);
              }
            }

            /* 500 - 1400ms: diagonal wipe following the route's own
               direction (top-right pin -> bottom-left pin). The black
               band moves across, progressively revealing the artwork —
               nothing is duplicated or redrawn. */
            @keyframes routeWipe {
              from {
                -webkit-mask-position: 140% -40%;
                mask-position: 140% -40%;
              }
              to {
                -webkit-mask-position: -60% 80%;
                mask-position: -60% 80%;
              }
            }

            /* 1400 - 2000ms: settle — made clearly visible (was too
               subtle before) with a bigger scale swing plus a slight
               upward drift, so motion reads for the full 600ms instead
               of feeling like the animation already stopped. */
            @keyframes settle {
              0% {
                transform: scale(1) translateY(0);
              }
              45% {
                transform: scale(1.022) translateY(-3px);
              }
              100% {
                transform: scale(1) translateY(0);
              }
            }

            /* Paired with settle: a soft brightness "sheen" so the
               final beat feels premium/intentional, not just a wobble.
               Purely a temporary filter — the artwork pixels/colors
               are never altered. */
            @keyframes sheen {
              0% {
                filter: brightness(1);
              }
              45% {
                filter: brightness(1.06);
              }
              100% {
                filter: brightness(1);
              }
            }

            @supports not (mask-image: linear-gradient(#000, transparent)) {
              .splash-bg {
                -webkit-mask-image: none;
                mask-image: none;
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .splash-bg {
                animation: none !important;
                opacity: 1;
                transform: none;
                filter: none;
                -webkit-mask-image: none;
                mask-image: none;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
