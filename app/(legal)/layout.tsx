import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-black text-sm font-semibold text-white">
              S
            </span>
            <span className="text-base font-semibold tracking-tight">Signflow</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-zinc-700 hover:text-zinc-950"
          >
            Anmelden
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-14 sm:py-20">{children}</div>
      </main>
      <LandingFooter />
    </div>
  );
}
