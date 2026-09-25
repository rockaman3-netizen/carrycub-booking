"use client";

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDG2BB4ZBKJIcsJWqqt_QFB8cZ5dp8RZbU",
  authDomain: "carrycub-truck-booking.firebaseapp.com",
  projectId: "carrycub-truck-booking",
  storageBucket: "carrycub-truck-booking.firebasestorage.app",
  messagingSenderId: "1074926867268",
  appId: "1:1074926867268:web:78324dd7403039dc037d11",
};

const VAPID_KEY =
  "BL4O0cvKCvKKSERsUVzdTRntbF-t7GIU5c4GzC8bLuu3k8rDcCLxcQqagd5naIGf1jvhVKRaL4NPaq3Wp3Ey3_0";

function app() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export async function registerPushToken(input: {
  role: "admin" | "driver" | "customer";
  driverId?: string;
  bookingId?: string;
}): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!(await isSupported())) return;
    if (!("serviceWorker" in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app());
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...input }),
    });
  } catch {
    /* notifications are a nice-to-have, never fatal */
  }
}
