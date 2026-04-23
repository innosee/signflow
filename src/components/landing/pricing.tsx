const TIERS = [
  {
    name: "Starter",
    price: "99 €",
    priceSuffix: "/ Monat",
    limit: "bis 10 Coaches",
    perCoach: "ab 9,90 € pro Coach",
    features: [
      "Unbegrenzt Kurse + Teilnehmer:innen",
      "Canvas-Signatur für Coach + TN",
      "Magic-Link-Versand via Resend",
      "A4-PDF-Export mit FES",
      "Audit-Log + EU-Hosting",
      "14 Tage kostenlos testen",
    ],
    highlighted: false,
  },
  {
    name: "Team",
    price: "199 €",
    priceSuffix: "/ Monat",
    limit: "bis 100 Coaches",
    perCoach: "ab 1,99 € pro Coach",
    features: [
      "Alles aus Starter",
      "Bildungsträger-Dashboard + Impersonation",
      "Priority-Support per E-Mail",
      "Monatsreports (Phase 2)",
      "Rechnungswesen-Vorbereitung",
    ],
    highlighted: true,
  },
  {
    name: "Bildungsträger",
    price: "399 €",
    priceSuffix: "/ Monat",
    limit: "bis 200 Coaches",
    perCoach: "ab 1,99 € pro Coach",
    features: [
      "Alles aus Team",
      "Dedicated-Onboarding",
      "Phone-Support",
      "Custom-AfA-Flags + Begründungsvorlagen",
      "AVV + Datenverarbeitungs-Review",
    ],
    highlighted: false,
  },
];

export function LandingPricing() {
  return (
    <section id="pricing" className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Preise
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Transparente Pauschale nach Coach-Anzahl.
          </h2>
          <p className="mt-3 text-sm text-zinc-600">
            Alle Preise exkl. MwSt. · monatlich kündbar · 14 Tage kostenlos
            testen · größere Teams (&gt;200 Coaches) individuell auf Anfrage.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {TIERS.map((t) => (
            <article
              key={t.name}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                t.highlighted
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white"
              }`}
            >
              {t.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
                  Empfohlen
                </span>
              )}
              <div>
                <h3
                  className={`text-lg font-semibold ${t.highlighted ? "text-white" : "text-zinc-950"}`}
                >
                  {t.name}
                </h3>
                <p
                  className={`mt-1 text-sm ${t.highlighted ? "text-zinc-300" : "text-zinc-500"}`}
                >
                  {t.limit}
                </p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span
                  className={`text-4xl font-semibold tracking-tight ${t.highlighted ? "text-white" : "text-zinc-950"}`}
                >
                  {t.price}
                </span>
                <span
                  className={`text-sm ${t.highlighted ? "text-zinc-300" : "text-zinc-500"}`}
                >
                  {t.priceSuffix}
                </span>
              </div>
              <p
                className={`mt-1 text-xs ${t.highlighted ? "text-zinc-400" : "text-zinc-500"}`}
              >
                {t.perCoach}
              </p>

              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className={`mt-0.5 h-4 w-4 shrink-0 ${t.highlighted ? "text-emerald-400" : "text-emerald-600"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M5 12l5 5 9-11"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      className={t.highlighted ? "text-zinc-200" : "text-zinc-700"}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="#waitlist"
                className={`mt-8 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium ${
                  t.highlighted
                    ? "bg-white text-zinc-950 hover:bg-zinc-100"
                    : "bg-black text-white hover:bg-zinc-800"
                }`}
              >
                Auf Warteliste setzen
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
