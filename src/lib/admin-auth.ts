// TEST ONLY: not real authentication.
//
// The password comes from NEXT_PUBLIC_ADMIN_PASSWORD (see .env.example) so it
// isn't hardcoded in the source. IMPORTANT: any NEXT_PUBLIC_* variable is
// inlined into the client-side JS bundle at build time — it is visible to
// anyone who opens devtools, same as a hardcoded string would be. This is
// still not real security. A trivially-guessable client-only password check
// is only appropriate for a private testing build; real admin auth needs a
// server-side check (an API route / middleware with a session cookie),
// which is out of scope for this test build.
//
// Now that bookings live in Google Sheets (a real, shared backend), the
// admin API routes (src/app/api/bookings, src/app/api/drivers, ...) check
// this same password via the x-admin-password header — see
// src/lib/admin-api-auth.ts on the server side. The session now stores the
// password itself (not just a "logged in" flag) so it can be replayed as
// that header; the security level is unchanged, this just closes the gap
// where those endpoints would otherwise have had no check at all.
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123";
const SESSION_KEY = "carrycub:admin-session";

export function adminLogin(password: string): boolean {
  if (password !== ADMIN_PASSWORD) return false;
  try {
    sessionStorage.setItem(SESSION_KEY, password);
  } catch {
    /* ignore */
  }
  return true;
}

export function isAdminLoggedIn(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export function adminLogout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// Attach to any fetch() that hits an admin-only API route.
export function adminHeaders(): Record<string, string> {
  try {
    const password = sessionStorage.getItem(SESSION_KEY);
    return password ? { "x-admin-password": password } : {};
  } catch {
    return {};
  }
}
