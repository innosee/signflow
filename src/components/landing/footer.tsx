import Link from "next/link";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-zinc-200 bg-zinc-950 text-zinc-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-sm font-semibold text-zinc-950">
              S
            </span>
            <span className="text-base font-semibold tracking-tight text-white">
              Signflow
            </span>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Digitale Anwesenheitsnachweise für AVGS-Maßnahmen — rechtssicher
            unterschreiben, FES-versiegeln, an die AfA übermitteln.
          </p>
        </div>

        <FooterGroup title="Produkt">
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
          <a href="#pricing">Preise</a>
          <a href="#faq">FAQ</a>
        </FooterGroup>

        <FooterGroup title="Konto">
          <Link href="/login">Anmelden</Link>
          <a href="#waitlist">Warteliste</a>
          <a href="mailto:info@innosee.de">Kontakt</a>
        </FooterGroup>

        <FooterGroup title="Rechtliches">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/cookies">Cookie-Hinweis</Link>
          <a href="mailto:info@innosee.de">AVV anfragen</a>
        </FooterGroup>
      </div>

      <div className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Signflow · ein Projekt von innosee</span>
          <span>Hosting in der EU (Frankfurt) · DSGVO-konform</span>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </h3>
      <nav
        aria-label={title}
        className="mt-3 flex flex-col gap-2 text-sm [&>a]:text-zinc-300 [&>a]:hover:text-white"
      >
        {children}
      </nav>
    </div>
  );
}
