import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  comingSoon = false,
  children,
}: {
  title: string;
  description?: string;
  /**
   * Sektion ist sichtbar, aber funktional noch nicht da. Visuell deutlich
   * abgesetzt (Opacity, gedeckte Hintergrund-Farbe) + "Coming soon"-Pille
   * im Header — der Nutzer soll erkennen, was geplant ist, ohne den
   * Eindruck zu kriegen, hier sei etwas kaputt.
   */
  comingSoon?: boolean;
  children: ReactNode;
}) {
  if (comingSoon) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6">
        <header className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-500">{title}</h2>
            <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Coming soon
            </span>
          </div>
          {description && (
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          )}
        </header>
        <div className="pointer-events-none select-none opacity-60">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-300 bg-white p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

export function BillingPlaceholder() {
  return (
    <div className="space-y-3 text-sm text-zinc-500">
      <p>
        An dieser Stelle findest du bald Rechnungen, dein Abo-Modell und die
        Zahlungsmethode.
      </p>
      <p className="text-xs">
        Wir warten noch auf die Multi-Tenant-Trennung und die
        Stripe-Anbindung — sobald die live sind, schalten wir den Bereich frei.
      </p>
    </div>
  );
}
