import Image from "next/image";
import Link from "next/link";

export default function Shell({
  title,
  accent,
  subtitle,
  action,
  banner,
  bannerFull,
  children,
}: {
  title: string;
  accent: string;
  subtitle: string;
  action?: { href: string; label: string };
  banner?: string;
  bannerFull?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f3f4f6] shadow-sm">
      {/* Hero */}
      {banner && bannerFull ? (
        <header className="relative w-full overflow-hidden">
          <Image
            src={banner}
            alt={`${title} ${accent}`}
            width={1671}
            height={941}
            priority
            className="block w-full"
          />
        </header>
      ) : (
        <header className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-sky-50 px-6 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)]">
          {banner ? (
            <Image
              src={banner}
              alt=""
              width={1671}
              height={941}
              priority
              className="pointer-events-none absolute -right-6 top-4 w-[62%] select-none opacity-95"
            />
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1 top-[max(env(safe-area-inset-top),1.75rem)] select-none text-[84px] leading-none opacity-90"
            >
              🚚
            </span>
          )}
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
      )}

      {/* Navy band + overlapping card */}
      <div
        className="flex flex-1 flex-col px-3"
        style={{ background: "linear-gradient(#0b1b3f 0 64px, #f3f4f6 64px)" }}
      >
        <div
          className={`${
            bannerFull ? "-mt-8" : "-mt-4"
          } relative z-10 flex flex-1 flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.18)]`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
