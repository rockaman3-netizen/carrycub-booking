"use client";

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
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

const VAPID_KEY =
  "BL4OOcvKCvKKSERsUVzdTRntbF-t7GIU5c4GzC8bLuu3k8rDcCLxcQqagd5naIGf1jvhVKRaL4NPaq3Wp3Ey3_0";

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
