// src/lib/push.ts

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64UrlEncode(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedJWT = `${encodedHeader}.${encodedClaimSet}`;

  const pemContents = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJWT)
  );

  const signedJWT = `${unsignedJWT}.${base64UrlEncode(signature)}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJWT,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google access token fetch failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!tokens || tokens.length === 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID!;
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    console.error('Push notification: access token error', err);
    return;
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: data || {},
            webpush: {
              notification: {
                title,
                body,
                icon: '/icon-192.png',
              },
              fcm_options: {
                link: '/',
              },
            },
          },
        }),
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Push failed for token ${tokens[i]}:`, r.reason);
    } else if (!r.value.ok) {
      r.value.text().then((t) => console.error(`Push failed (${r.value.status}) for token ${tokens[i]}:`, t));
    }
  });
}
