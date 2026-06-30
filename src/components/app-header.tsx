"use client";

import Link from "next/link";
import { useState } from "react";

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
  /**
   * Anzahl ungelesener Changelog-Einträge. >0 → blaue Bubble am „Neu"-Link.
   * Der „Neu"-Link selbst ist immer sichtbar (auch bei 0).
   */
  changelogUnreadCount?: number;
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
  changelogUnreadCount = 0,
  userName,
  settingsHref,
  impersonating,
  logoutAction,
  stopImpersonationAction,
}: Props) {
  // Mobile-Menü-State: unter `md` klappt Nav + Aktionen in ein Panel.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  // Nav-Links einmal bauen, in Desktop- (horizontal) und Mobile-Panel
  // (gestapelt) wiederverwenden. customNav (Coach-Switcher) wird ebenfalls
  // in beiden Positionen gerendert — eigenständige React-Instanzen.
  const navItems =
    navLinks?.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        onClick={closeMenu}
        className="text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
      >
        {l.label}
      </Link>
    )) ?? null;

  const hasNav = Boolean(customNav) || (navItems?.length ?? 0) > 0;

  // Rechte Aktionsleiste (Einladungen/Tenant/Einstellungen/Abmelden) —
  // identisch in Desktop-Zeile und Mobile-Panel.
  const actions = (
    <>
      <Link
        href="/neu"
        onClick={closeMenu}
        className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Neu
        {changelogUnreadCount > 0 && (
          <span
            aria-label={`${changelogUnreadCount} ungelesen`}
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
          >
            {changelogUnreadCount}
          </span>
        )}
      </Link>
      {invitationsCount > 0 && !impersonating && (
        <Link
          href="/konto/einladungen"
          onClick={closeMenu}
          className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          Einladungen ({invitationsCount})
        </Link>
      )}
      {tenantSwitcher && !impersonating && tenantSwitcher}
      {settingsHref && !impersonating && (
        <Link
          href={settingsHref}
          onClick={closeMenu}
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
    </>
  );

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
        <div className="mx-auto w-full max-w-4xl px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <Link
                href={brandHref}
                onClick={closeMenu}
                className="flex items-baseline gap-1.5 text-base font-semibold tracking-tight"
              >
                <span>Signflow</span>
                {brandSubText}
              </Link>
              {/* Desktop-Nav: ab md sichtbar, mobil im Panel unten. */}
              {hasNav && (
                <div className="hidden md:flex md:items-center md:gap-6">
                  {customNav ?? (
                    <nav
                      aria-label="Hauptnavigation"
                      className="flex items-center gap-4 text-sm"
                    >
                      {navItems}
                    </nav>
                  )}
                </div>
              )}
            </div>

            {/* Desktop-Aktionen */}
            <div className="hidden items-center gap-3 md:flex">{actions}</div>

            {/* Mobile-Toggle */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="app-mobile-menu"
              aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-50 md:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Mobile-Panel: Nav + Aktionen gestapelt, nur unter md. */}
          {menuOpen && (
            <div
              id="app-mobile-menu"
              className="mt-3 flex flex-col gap-4 border-t border-zinc-200 pt-4 md:hidden"
            >
              {hasNav &&
                (customNav ? (
                  // Klick auf einen Link im Coach-Switcher schließt das Panel
                  // (Bubbling — die Switcher-Links haben kein eigenes onClick).
                  <div onClick={closeMenu}>{customNav}</div>
                ) : (
                  <nav
                    aria-label="Hauptnavigation"
                    className="flex flex-col gap-3 text-sm"
                  >
                    {navItems}
                  </nav>
                ))}
              <div className="flex flex-col items-start gap-3 border-t border-zinc-200 pt-3">
                {actions}
              </div>
            </div>
          )}
        </div>
        {accentStrip}
      </header>
    </>
  );
}
