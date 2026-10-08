// src/lib/push.ts
// SERVER ONLY. Sends FCM push notifications using the same Firebase
// service account credentials as src/lib/sheets.ts (REST API, no
// firebase-admin SDK — works on Cloudflare Workers).

import { SignJWT, importPKCS8 } from "jose";
import { deleteDeviceToken } from "@/lib/sheets";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const projectId = () => process.env.FIREBASE_PROJECT_ID || "carrycub-truck-booking";

function cleanPrivateKey(): string {
  let raw = env("FIREBASE_PRIVATE_KEY").trim();
  if (raw.startsWith("{")) {
    try {
      raw = JSON.parse(raw).private_key || raw;
    } catch {}
  }
  raw = raw.replace(/\\n/g, "\n");

  const begin = raw.match(/BEGIN\s+PRIVATE\s+KEY/);
  if (begin && begin.index !== undefined) raw = raw.slice(begin.index + begin[0].length);
  const end = raw.search(/END\s+PRIVATE\s+KEY/);
  if (end >= 0) raw = raw.slice(0, end);

  let body = raw.replace(/[^A-Za-z0-9+/=]/g, "");
  const start = body.indexOf("MII");
  if (start > 0 && start < 12) body = body.slice(start);

  if (body.length < 1000) {
    throw new Error(`FIREBASE_PRIVATE_KEY incomplete (only ${body.length} chars found)`);
  }
  if (!body.startsWith("MII")) {
    throw new Error(`FIREBASE_PRIVATE_KEY does not look like a key (starts with "${body.slice(0, 4)}")`);
  }
  const lines = (body.match(/.{1,64}/g) as string[]).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

let cachedToken: { value: string; exp: number } | null = null;

async function getFcmToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const email = env("FIREBASE_CLIENT_EMAIL").trim();
  const key = await importPKCS8(cleanPrivateKey(), "RS256");

  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Firebase auth (FCM) failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, exp: now + data.expires_in };
  return data.access_token;
}

// Har token ke liye Google ka jawab (diagnostic ke kaam aata hai).
export type PushResult = {
  tokenTail: string; // token ke sirf aakhri 8 akshar
  ok: boolean;
  status: number;
  detail: string;
  removed?: boolean; // true = token mara hua tha (UNREGISTERED) aur Firestore se delete ho gaya
};

// android options:
//  - channelId / sound: native Android notification channel + tone.
//  - dataOnly: true  -> "notification" part NAHI bheja jata. Title/body `data`
//    me jate hain, taaki APK ki DriverMessagingService chale aur lambi ring baje.
// Har Android message high priority ke saath jata hai (sleep mode me bhi turant).
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  android?: { channelId: string; sound?: string; dataOnly?: boolean },
): Promise<PushResult[]> {
  if (!tokens || tokens.length === 0) return [];

  let accessToken: string;
  try {
    accessToken = await getFcmToken();
  } catch (err) {
    console.error("Push notification: could not get access token", err);
    return [
      {
        tokenTail: "-",
        ok: false,
        status: 0,
        detail: `auth failed: ${(err as Error).message}`,
      },
    ];
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`;
  const dataOnly = android?.dataOnly === true;

  const buildMessage = (token: string) => {
    if (dataOnly) {
      return {
        token,
        data: { ...(data || {}), title, body },
        android: {
          priority: "HIGH",
          ttl: "60s",
        },
      };
    }
    return {
      token,
      notification: { title, body },
      data: data || {},
      android: {
        priority: "HIGH",
        ...(android
          ? {
              notification: {
                channel_id: android.channelId,
                sound: android.sound ?? "default",
              },
            }
          : {}),
      },
      webpush: {
        notification: { title, body, icon: "/icon-192.png" },
        fcm_options: { link: "/" },
      },
    };
  };

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: buildMessage(token) }),
      }),
    ),
  );

  const out: PushResult[] = [];
  const deadIdx: number[] = []; // jin tokens ko Google ne UNREGISTERED bola
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tokenTail = tokens[i].slice(-8);
    if (r.status === "rejected") {
      console.error(`Push failed for token ${tokens[i]}:`, r.reason);
      out.push({ tokenTail, ok: false, status: 0, detail: String(r.reason).slice(0, 300) });
    } else {
      const text = await r.value.text();
      // Sirf tab "mara hua" maanenge jab status 404 ho AUR jawab me UNREGISTERED likha ho.
      // (Galat project/URL jaisi galti me token galti se delete na ho.)
      const isDead = r.value.status === 404 && text.includes("UNREGISTERED");
      if (!r.value.ok) {
        console.error(`Push failed (${r.value.status}) for token ${tokens[i]}:`, text);
      }
      if (isDead) deadIdx.push(i);
      out.push({ tokenTail, ok: r.value.ok, status: r.value.status, detail: text.slice(0, 300) });
    }
  }

  // Mare hue tokens Firestore se hata do. Fail ho to bhi push ka kaam nahi rukna chahiye.
  if (deadIdx.length > 0) {
    const removal = await Promise.allSettled(deadIdx.map((i) => deleteDeviceToken(tokens[i])));
    removal.forEach((res, k) => {
      if (res.status === "fulfilled") {
        out[deadIdx[k]].removed = true;
      } else {
        console.error("Could not delete dead token", res.reason);
      }
    });
  }
  return out;
}
