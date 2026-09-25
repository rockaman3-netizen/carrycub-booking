// src/lib/push.ts
// SERVER ONLY. Sends FCM push notifications using the same Firebase
// service account credentials as src/lib/sheets.ts (REST API, no
// firebase-admin SDK — works on Cloudflare Workers).

import { SignJWT, importPKCS8 } from "jose";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const projectId = () => process.env.FIREBASE_PROJECT_ID || "carrycub-truck-booking";

// Same key-cleaning logic as sheets.ts — accepts the key pasted in
// almost any form (whole JSON, with/without BEGIN/END lines, literal \n, etc.)
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

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!tokens || tokens.length === 0) return;

  let accessToken: string;
  try {
    accessToken = await getFcmToken();
  } catch (err) {
    console.error("Push notification: could not get access token", err);
    return;
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: data || {},
            webpush: {
              notification: { title, body, icon: "/icon-192.png" },
              fcm_options: { link: "/" },
            },
          },
        }),
      }),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`Push failed for token ${tokens[i]}:`, r.reason);
    } else if (!r.value.ok) {
      const text = await r.value.text();
      console.error(`Push failed (${r.value.status}) for token ${tokens[i]}:`, text);
    }
  }
}
