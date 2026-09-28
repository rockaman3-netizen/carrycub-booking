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
  const res = await fetch("/api/notifications/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...input }),
  });
  if (!res.ok) {
    alert(`Register API failed: ${res.status} ${await res.text()}`);
  } else if (input.role !== "driver") {
    alert("Token registered successfully!");
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
    alert(`Permission not granted: ${status}`);
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

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", async (t) => {
    await sendTokenToServer(t.value, input);
  });
  await PushNotifications.addListener("registrationError", (e) => {
    alert(`Native push registration error: ${JSON.stringify(e)}`);
  });
  await PushNotifications.register();
}

// Normal browser (website): web push via service worker
async function registerWeb(input: PushInput): Promise<void> {
  if (!(await isSupported())) {
    alert("Push not supported on this browser");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    alert("Service worker not supported");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert(`Permission not granted: ${permission}`);
    return;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(app());
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    alert("Could not get FCM token (token was empty)");
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
      alert(`Push setup error: ${err}`);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
