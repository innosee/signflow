import Link from "next/link";

type NavLink = { href: string; label: string };

type Props = {
  brandHref: string;
  /**
   * Klassische Flat-Nav-Liste. Wird gerendert, wenn `customNav` nicht
   * gesetzt ist. BT-Layout nutzt das weiter unverändert.
   */
  navLinks?: NavLink[];
  /**
   * Alternative zum `navLinks`-Pattern: ein komplett vom Layout
   * geliefertes Nav-Element. Coach-Layout setzt hier den Tool-Switcher
   * inkl. tool-spezifischer Sub-Nav rein. Wenn gesetzt, überschreibt
   * es `navLinks`.
   */
  customNav?: React.ReactNode;
  /**
   * Optionaler Subtext direkt neben „Signflow" — z.B. „· Signatur"
   * oder „· Checker". Client-rendered (pathname-abhängig).
   */
  brandSubText?: React.ReactNode;
  /**
   * Optionale Accent-Strip-Komponente, die direkt unter dem Header
   * rendert. Coach-Layout setzt hier den tool-spezifischen Farbstreifen
   * rein. BT-Layout kann das weglassen.
   */
  accentStrip?: React.ReactNode;
  /**
   * Optionaler Tenant-Switcher (Membership-Modell). Wird links neben dem
   * User-Block gerendert. Bei Impersonation bewusst weggelassen (Kontext-
   * Wechsel ist dann blockiert).
   */
  tenantSwitcher?: React.ReactNode;
  /**
   * Anzahl offener Einladungen des Users (Membership-Modell). >0 → ein
   * Hinweis-Link auf /konto/einladungen wird im Header gezeigt.
   */
  invitationsCount?: number;
  userName: string;
  userEmail: string;
  /** Optionaler Link zur Einstellungs-Seite (Profil/Passwort/Branding/Billing). */
  settingsHref?: string;
  impersonating: boolean;
  logoutAction: () => Promise<void>;
  stopImpersonationAction: () => Promise<void>;
};

export function AppHeader({
  brandHref,
  navLinks,
  customNav,
  brandSubText,
  accentStrip,
  tenantSwitcher,
  invitationsCount = 0,
  userName,
  userEmail,
  settingsHref,
  impersonating,
  logoutAction,
  stopImpersonationAction,
}: Props) {
  return (
    <>
      {impersonating && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900"
        >
          <div>
            <strong>Impersonation aktiv.</strong> Du arbeitest als {userName}.
            Schreibende Aktionen sind blockiert.
          </div>
          <form action={stopImpersonationAction}>
            <button
              type="submit"
              className="rounded-lg border border-amber-500 px-3 py-1 text-xs font-medium hover:bg-amber-100"
            >
              Impersonation beenden
            </button>
          </form>
        </div>
      )}

      <header className="border-b border-zinc-300 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              href={brandHref}
              className="flex items-baseline gap-1.5 text-base font-semibold tracking-tight"
            >
              <span>Signflow</span>
              {brandSubText}
            </Link>
            {customNav ? (
              customNav
            ) : (
              navLinks && (
                <nav
                  aria-label="Hauptnavigation"
                  className="flex items-center gap-4 text-sm"
                >
                  {navLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            {invitationsCount > 0 && !impersonating && (
              <Link
                href="/konto/einladungen"
                className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                Einladungen ({invitationsCount})
              </Link>
            )}
            {tenantSwitcher && !impersonating && tenantSwitcher}
            <div className="hidden text-right text-xs text-zinc-600 sm:block">
              <div className="font-medium text-zinc-900">{userName}</div>
              <div>{userEmail}</div>
            </div>
            {settingsHref && !impersonating && (
              <Link
                href={settingsHref}
                className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                Einstellungen
              </Link>
            )}
            {!impersonating && (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
                >
                  Abmelden
                </button>
              </form>
            )}
          </div>
        </div>
        {accentStrip}
      </header>
    </>
  );
}
