const KEY = "carrycub:recent-booking-ids";
const ACTIVE_KEY = "carrycub:active-booking";
const MAX = 5;

export function rememberRecentBookingId(id: string) {
  try {
    const list = getRecentBookingIds().filter((x) => x !== id);
    list.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    // The booking the customer is currently following. Cleared once it is
    // delivered or cancelled (see clearActiveBookingId).
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getRecentBookingIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function getActiveBookingId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function clearActiveBookingId(id: string) {
  try {
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
