const KEY = "carrycub:recent-booking-ids";
const MAX = 5;

export function rememberRecentBookingId(id: string) {
  try {
    const list = getRecentBookingIds().filter((x) => x !== id);
    list.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
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
