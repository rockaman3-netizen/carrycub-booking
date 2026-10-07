"use client";

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const firebaseConfig = {
  apiKey: "AIzaSyDG2BB4ZBKJIcsJWqqt_QFB8cZ5dp8RZbU",
  authDomain: "carrycub-truck-booking.firebaseapp.com",
  projectId: "carrycub-truck-booking",
  storageBucket: "carrycub-truck-booking.firebasestorage.app",
  messagingSenderId: "1074926867268",
  appId: "1:1074926867268:web:78324dd7403039dc037d11",
};

// NOTE: paanchva akshar number ZERO (0) hai, angrezi O nahi.
const VAPID_KEY =
  "BL4O0cvKCvKKSERsUVzdTRntbF-t7GIU5c4GzC8bLuu3k8rDcCLxcQqagd5naIGf1jvhVKRaL4NPaq3Wp3Ey3_0";

// Native token fail hone par kitni baar dobara try karna hai
const MAX_NATIVE_RETRIES = 6;

type PushInput = {
  role: "admin" | "driver" | "customer";
  driverId?: string;
  bookingId?: string;
};

function app() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Screen ke neeche chhoti status patti (alert nahi). Tap karne par hat jati hai.
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function status(msg: string, isError = false, hideAfterMs = 0): void {
  try {
    if (typeof document === "undefined") return;
    let el = document.getElementById("push-status-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "push-status-banner";
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px 12px;" +
        "font:12px/1.4 monospace;color:#fff;word-break:break-all;";
      el.onclick = () => el && el.remove();
      document.body.appendChild(el);
    }
    el.style.background = isError ? "#991b1b" : "#1e3a8a";
    el.textContent = "PUSH: " + msg;
    if (hideTimer) clearTimeout(hideTimer);
    if (hideAfterMs > 0) {
      hideTimer = setTimeout(() => {
        const e = document.getElementById("push-status-banner");
        if (e) e.remove();
      }, hideAfterMs);
    }
  } catch {
    // status patti ki wajah se kabhi kuch nahi tootna chahiye
  }
}

// ---------- Website tone (browser ke Web Audio se, koi audio file nahi) ----------

let audioCtx: AudioContext | null = null;
let audioHooked = false;

function getAudioCtx(): AudioContext | null {
  try {
    if (audioCtx) return audioCtx;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

// Browser tone tabhi bajane deta hai jab page par ek baar tap hua ho.
function hookAudioUnlock(): void {
  if (audioHooked || typeof window === "undefined") return;
  audioHooked = true;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  ["pointerdown", "touchstart", "keydown", "click"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }),
  );
}

function beep(ctx: AudioContext, start: number, freq: number, dur: number, vol: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// "booking": admin ke liye tez high-pitch 3 baar. "confirm": customer ke liye do sur.
async function playTone(kind: "booking" | "confirm"): Promise<void> {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    const t = ctx.currentTime + 0.05;
    if (kind === "booking") {
      for (let i = 0; i < 3; i++) {
        beep(ctx, t + i * 0.5, 1320, 0.2, 0.7);
        beep(ctx, t + i * 0.5 + 0.22, 1760, 0.2, 0.7);
      }
    } else {
      beep(ctx, t, 880, 0.25, 0.6);
      beep(ctx, t + 0.3, 1320, 0.45, 0.6);
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // tone na baje to bhi kuch nahi tootna chahiye
  }
}

// Page khula ho tab message aaye to: tone + notification dikhao.
let foregroundHooked = false;

function hookForeground(messaging: Messaging, registration: ServiceWorkerRegistration): void {
  if (foregroundHooked) return;
  foregroundHooked = true;
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || "CarryCub";
    const body = payload.notification?.body || payload.data?.body || "";
    const type = payload.data?.type || "";
    status(`notification mila: ${title}`, false, 6000);
    void playTone(type === "new_booking" ? "booking" : "confirm");
    try {
      registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        tag: type ? `${type}-${payload.data?.bookingId || ""}` : undefined,
      });
    } catch {
      // notification na dikhe to bhi tone aur patti chalenge
    }
  });
}

// --------------------------------------------------------------------------------

async function sendTokenToServer(token: string, input: PushInput): Promise<void> {
  status("token mila, server ko bhej raha hoon...");
  try {
    const res = await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...input }),
    });
    if (!res.ok) {
      const text = await res.text();
      status(`server ne mana kiya: HTTP ${res.status} ${text.slice(0, 150)}`, true);
    } else {
      status("DONE: token server me save ho gaya (HTTP 200)", false, 8000);
    }
  } catch (err) {
    status(`server tak request nahi gayi: ${String(err).slice(0, 150)}`, true);
  }
}

// Permission dialog ka jawab aane tak wait karta hai (max ~20 sec)
async function getFinalPermission(): Promise<string> {
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  let tries = 0;
  while (
    (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") &&
    tries < 20
  ) {
    await sleep(1000);
    perm = await PushNotifications.checkPermissions();
    tries++;
  }
  return perm.receive;
}

// Native Android app (Capacitor APK): real FCM token + custom tone channel
async function registerNative(input: PushInput): Promise<void> {
  status("android app: notification permission check ho rahi hai...");
  const perm = await getFinalPermission();
  if (perm !== "granted") {
    status(`notification permission nahi mili: ${perm}`, true);
    return;
  }
  status("permission mil gayi, channel ban raha hai...");

  if (input.role === "driver") {
    // Driver app: phone-ring style tone when a booking is assigned
    await PushNotifications.createChannel({
      id: "driver_assign_channel",
      name: "New Trip Assigned",
      description: "Ring when a booking is assigned to you",
      importance: 5,
      sound: "driver_ring",
      vibration: true,
      visibility: 1,
    });
  } else {
    // Customer app: chime when a driver accepts the booking
    await PushNotifications.createChannel({
      id: "driver_accept_channel",
      name: "Driver Accept Notifications",
      description: "Alerts when a driver accepts your booking",
      importance: 5,
      sound: "notification_sound",
      vibration: true,
      visibility: 1,
    });
  }

  let retries = 0;

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", async (t) => {
    retries = 0;
    await sendTokenToServer(t.value, input);
  });
  await PushNotifications.addListener("registrationError", async (e) => {
    const msg = JSON.stringify(e);
    if (retries < MAX_NATIVE_RETRIES) {
      retries++;
      status(`token error (${retries}/${MAX_NATIVE_RETRIES}), dobara try: ${msg.slice(0, 120)}`, true);
      // SERVICE_NOT_AVAILABLE aksar thodi der ka hota hai -> khud dobara try
      await sleep(Math.min(3000 * retries, 15000));
      try {
        await PushNotifications.register();
      } catch (err) {
        status(`retry fail: ${String(err).slice(0, 120)}`, true);
      }
    } else {
      status(`token nahi ban paya (${MAX_NATIVE_RETRIES} try ke baad): ${msg.slice(0, 150)}`, true);
    }
  });
  status("Firebase se token maang raha hoon...");
  await PushNotifications.register();
}

// Normal browser (website): web push via service worker
async function registerWeb(input: PushInput): Promise<void> {
  if (!(await isSupported())) {
    status("is browser me push support nahi hai", true);
    return;
  }
  if (!("serviceWorker" in navigator)) {
    status("service worker support nahi hai", true);
    return;
  }

  hookAudioUnlock();

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    status(`notification permission nahi mili: ${permission}`, true);
    return;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app());

  let token = "";
  let lastErr: unknown = null;
  for (let i = 0; i < 3 && !token; i++) {
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
    } catch (err) {
      lastErr = err;
      await sleep(2000 * (i + 1));
    }
  }
  if (!token) {
    status(`web token nahi bana: ${String(lastErr).slice(0, 200)}`, true);
    return;
  }

  hookForeground(messaging, registration);
  await sendTokenToServer(token, input);
}

// Ek saath do baar register na ho
let inflight: Promise<void> | null = null;

export function registerPushToken(input: PushInput): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (typeof window === "undefined") return;
      if (Capacitor.isNativePlatform()) {
        await registerNative(input);
      } else {
        await registerWeb(input);
      }
    } catch (err) {
      status(`push setup error: ${String(err).slice(0, 200)}`, true);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
