// Shared "contact" action buttons (Call / WhatsApp).
//
// These never render the raw phone number as text — only as the target of a
// tel:/wa.me link — so a screenshot or the rendered page itself doesn't leak
// the digits. Callers decide *whether* to render these at all; that's where
// the "only show contact details to the relevant customer, assigned driver,
// or admin" rule is enforced (see TrackingView / driver BookingDetail).

export function toIndianE164(phone: string | number | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return `+91${last10}`;
}

export function CallButton({
  phone,
  label = "Call",
  className,
}: {
  phone: string | number | null | undefined;
  label?: string;
  className?: string;
}) {
  const e164 = toIndianE164(phone);
  if (!e164) return null;
  return (
    <a
      href={`tel:${e164}`}
      aria-label={label}
      className={
        className ??
        "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-2 py-2.5 text-center text-sm font-semibold text-white active:bg-brand-dark"
      }
    >
      📞 {label}
    </a>
  );
}

export function WhatsAppButton({
  phone,
  label = "WhatsApp",
  message,
  className,
}: {
  phone: string | number | null | undefined;
  label?: string;
  message?: string;
  className?: string;
}) {
  const e164 = toIndianE164(phone);
  if (!e164) return null;
  const number = e164.replace("+", "");
  const url = `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={
        className ??
        "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-green-500 px-2 py-2.5 text-center text-sm font-semibold text-green-600 active:bg-green-50"
      }
    >
      💬 {label}
    </a>
  );
}
