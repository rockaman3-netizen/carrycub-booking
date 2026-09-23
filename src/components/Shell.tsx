import Link from "next/link";

export default function Shell({
  title,
  accent,
  subtitle,
  action,
  children,
}: {
  title: string;
  accent: string;
  subtitle: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6] shadow-sm">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-sky-50 px-6 pb-10 pt-10">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1 top-7 select-none text-[84px] leading-none opacity-90"
        >
          🚚
        </span>
        <h1 className="relative text-[26px] font-extrabold leading-tight text-navy">
          {title}
          <span className="block text-brand">{accent}</span>
        </h1>
        <p className="relative mt-2 max-w-[190px] text-[13px] text-gray-500">{subtitle}</p>
        {action && (
          <Link
            href={action.href}
            className="relative mt-4 inline-block rounded-full border border-navy/20 bg-white/70 px-4 py-1.5 text-xs font-medium text-navy"
          >
            {action.label}
          </Link>
        )}
      </header>

      {/* Navy band + overlapping card */}
      <div
        className="flex flex-1 flex-col px-3"
        style={{ background: "linear-gradient(#0b1b3f 0 64px, #f3f4f6 64px)" }}
      >
        <div className="-mt-4 flex flex-1 flex-col rounded-t-3xl bg-white shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
