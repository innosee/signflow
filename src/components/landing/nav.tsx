import Link from "next/link";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-black text-sm font-semibold text-white">
            S
          </span>
          <span className="text-base font-semibold tracking-tight">Signflow</span>
        </Link>

        <nav
          aria-label="Hauptnavigation"
          className="hidden items-center gap-6 text-sm text-zinc-700 md:flex"
        >
          <Link href="/#workflow" className="hover:text-zinc-950">
            Workflow
          </Link>
          <Link href="/#features" className="hover:text-zinc-950">
            Features
          </Link>
          <Link href="/anleitung" className="hover:text-zinc-950">
            Anleitung
          </Link>
          <Link href="/#pricing" className="hover:text-zinc-950">
            Preise
          </Link>
          <Link href="/#faq" className="hover:text-zinc-950">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm text-zinc-700 hover:text-zinc-950 sm:inline-block"
          >
            Anmelden
          </Link>
          <Link
            href="/#waitlist"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Zur Warteliste
          </Link>
        </div>
      </div>
    </header>
  );
}
