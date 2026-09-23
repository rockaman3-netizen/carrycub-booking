export type LatLng = { lat: number; lng: number };

export type BookingInput = {
  pickup: string;
  drop: string;
  vehicleId: string;
  name: string;
  mobile: string;
  notes: string;
};

export type Booking = BookingInput & {
  id: string;
  createdAt: string; // ISO string
  // Real coordinates resolved once, at booking time — from the device's GPS
  // (if "Use current location" was used for pickup) or by geocoding the
  // typed address against OpenStreetMap. undefined = not resolved yet,
  // null = resolution was attempted and failed. Never a fabricated point.
  pickupLoc?: LatLng | null;
  dropLoc?: LatLng | null;
  // Test fare estimate, computed at booking time from real geocoded points
  // (see src/lib/fare.ts + src/lib/fareConfig.ts). undefined = not computed
  // (e.g. an address couldn't be geocoded); never a fabricated number.
  distanceKm?: number | null;
  estimatedFare?: number | null;
};

export type BookingErrors = Partial<Record<keyof BookingInput, string>>;

export const normalizeId = (id: string) => id.trim().toUpperCase();

// Temporary (frontend-only) booking ID, e.g. CC-260922-K7QM
export function generateBookingId(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `CC-${yy}${mm}${dd}-${suffix}`;
}

// Upper bounds mainly guard against pasted/garbage input bloating storage
// and breaking layout — validated again server-side in the API routes
// (src/app/api/bookings/route.ts) before anything is written to the sheet.
const MAX_ADDRESS_LEN = 120;
const MAX_NAME_LEN = 60;
const MAX_NOTES_LEN = 300;

export function validateBooking(input: BookingInput): BookingErrors {
  const errors: BookingErrors = {};
  const pickup = input.pickup.trim();
  const drop = input.drop.trim();
  const name = input.name.trim();

  if (pickup.length < 3) errors.pickup = "Enter pickup location";
  else if (pickup.length > MAX_ADDRESS_LEN) errors.pickup = "Pickup location is too long";

  if (drop.length < 3) errors.drop = "Enter drop location";
  else if (drop.length > MAX_ADDRESS_LEN) errors.drop = "Drop location is too long";

  if (!input.vehicleId) errors.vehicleId = "Select a vehicle";

  if (name.length < 2) errors.name = "Enter your name";
  else if (name.length > MAX_NAME_LEN) errors.name = "Name is too long";

  if (!/^[6-9]\d{9}$/.test(input.mobile)) {
    errors.mobile = "Enter a valid 10-digit mobile number";
  }

  if (input.notes.trim().length > MAX_NOTES_LEN) {
    errors.notes = "Notes are too long (max 300 characters)";
  }

  return errors;
}
