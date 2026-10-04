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

async function sendTokenToServer(token: string, input: PushInput): Promise<void> {
  try {
    const res = await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...input }),
    });
    if (!res.ok) {
      console.error(`Register API failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Register API error", err);
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
  const status = await getFinalPermission();
  if (status !== "granted") {
    console.error(`Push permission not granted: ${status}`);
    return;
  }

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
    console.error("Native push registration error:", JSON.stringify(e));
    // SERVICE_NOT_AVAILABLE aksar thodi der ka hota hai -> khud dobara try
    if (retries < MAX_NATIVE_RETRIES) {
      retries++;
      await sleep(Math.min(3000 * retries, 15000));
      try {
        await PushNotifications.register();
      } catch (err) {
        console.error("Native push retry failed", err);
      }
    }
  });
  await PushNotifications.register();
}

// Normal browser (website): web push via service worker
async function registerWeb(input: PushInput): Promise<void> {
  if (!(await isSupported())) {
    console.error("Push not supported on this browser");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    console.error("Service worker not supported");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.error(`Push permission not granted: ${permission}`);
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
    console.error("Web push: could not get FCM token", lastErr);
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
      console.error("Push setup error:", err);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
