# CarryCub Booking (standalone, testing)

Next.js (App Router) + TypeScript + Tailwind CSS v4. Mobile-first.
Not connected to the main CarryCub website.

**Bookings, drivers, and live GPS now live in Google Sheets, via a Google
Apps Script Web App** — see [APPS_SCRIPT_SETUP.md](./APPS_SCRIPT_SETUP.md)
for the one-time setup (spreadsheet, script deployment, env vars). Admin
and driver login sessions are still browser-side only (see "Before real
deployment" below).

## Run locally
```bash
cp .env.example .env.local   # fill in the Apps Script vars — see APPS_SCRIPT_SETUP.md
npm install
npm run dev
```
Open http://localhost:3000 (use phone view in browser devtools).

- Admin panel: `/admin/login` — password from `NEXT_PUBLIC_ADMIN_PASSWORD` (defaults to `admin123`)
- Driver panel: `/driver/login` — phone number from a row in the `Drivers` sheet tab

## Type check
```bash
npm run lint
```

## PWA (installable app)
Customer and driver are separate installable apps sharing one origin:
- Customer: manifest at `/manifest-customer.json`, installs from any
  customer page (`/`, `/track`, `/booking/...`), opens to `/`.
- Driver: manifest at `/manifest-driver.json` (applied via
  `src/app/driver/layout.tsx`), installs from `/driver`, opens to `/driver`.
- One service worker (`public/sw.js`, registered from `src/components/
  ServiceWorkerRegister.tsx`) covers both. `/api/**` is never cached —
  booking/driver/location data is always fetched live. Static assets are
  cached at runtime (cache-first); pages are network-first with a cached
  fallback, and `public/offline.html` is the last resort when nothing's
  cached and there's no connection.
- PWA install only works over HTTPS (localhost is exempt). On a real
  deploy this is automatic on most hosts (e.g. Vercel).
- After changing `public/sw.js`, bump `CACHE_VERSION` inside it — that's
  what makes the browser pick up the new worker and drop the old cache.

## Before real deployment
This build is intentionally lightweight for fast iteration. Before treating
it as more than a test/demo, it still needs:
- Server-side admin and driver authentication — the current password/phone
  checks run entirely in the browser and can't be made secure with
  environment variables alone, since anything `NEXT_PUBLIC_*` ships in the
  client bundle. (The admin API routes now also check the same password via
  a header, but that's the same client-exposed value, not real auth.)
- A real routing/distance service (OSRM, Google Directions, etc.) — fares
  currently use a straight-line-distance estimate, clearly marked as such.
- Rate limiting / less guessable booking IDs if booking tracking is exposed
  publicly, since anyone with an ID can currently view that booking's
  status and live location.
- If volume grows a lot, revisit Google Sheets as the data store — see the
  "Notes / limitations" section at the bottom of SETUP.md (polling instead
  of real-time push, no transactional writes).
