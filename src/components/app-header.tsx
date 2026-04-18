import Link from "next/link";

type NavLink = { href: string; label: string };

type Props = {
  brandHref: string;
  navLinks: NavLink[];
  userName: string;
  userEmail: string;
  impersonating: boolean;
  logoutAction: () => Promise<void>;
  stopImpersonationAction: () => Promise<void>;
};

export function AppHeader({
  brandHref,
  navLinks,
  userName,
  userEmail,
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
            <Link href={brandHref} className="text-base font-semibold tracking-tight">
              Signflow
            </Link>
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
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs text-zinc-600 sm:block">
              <div className="font-medium text-zinc-900">{userName}</div>
              <div>{userEmail}</div>
            </div>
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
      </header>
    </>
  );
}
