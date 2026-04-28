import Link from "next/link";

export function LandingCheckerTeaser() {
  return (
    <section className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div className="space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Neu: Modul B
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Abschlussberichte, die der Bildungsträger nicht zurückschickt.
          </h2>
          <p className="text-base leading-relaxed text-zinc-600">
            Schreib teilnehmerbezogene Abschlussberichte direkt in Signflow.
            Der Checker anonymisiert deine Inhalte in Frankfurt, prüft sie
            gegen den AMDL-Regelkatalog und schlägt konkrete Umformulierungen
            vor — übernehmbar in einem Klick.
          </p>
          <ul className="space-y-2.5 text-sm text-zinc-700">
            <Bullet>
              KI-gestützte Regelprüfung gegen die häufigsten AfA-Ablehnungs-Trigger
            </Bullet>
            <Bullet>
              Pseudonymisierung mit GLiNER + Llama 3.3 in der EU — dein Klartext
              verlässt Deutschland nie
            </Bullet>
            <Bullet>
              Vorschläge stückweise übernehmen — pro Stelle ein Klick,
              direkt neben dem Editor, ohne Modus-Wechsel
            </Bullet>
            <Bullet>
              PDF-Export für deinen Bildungsträger, passend zum erango-Standard
            </Bullet>
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/anleitung#checker"
              className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Anleitung lesen
              <span aria-hidden>→</span>
            </Link>
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Auf Warteliste
            </a>
          </div>
        </div>

        <div className="relative">
          <CheckerMockup />
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5 9-11"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Statisches Mockup des Checker-Ergebnisses — zeigt Pflichtbausteine + eine
 * Beispiel-Violation mit Umformulierung. Ohne Bild-Asset oder externe Library,
 * damit die Landing-Bundle-Size klein bleibt.
 */
function CheckerMockup() {
  return (
    <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-xl shadow-zinc-950/5 sm:p-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Berichts-Checker
          </div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-950">
            Maria S. — AVGS Karrierecoaching
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          überarbeiten
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
          <span className="text-[11px] font-semibold text-zinc-900">
            Pflichtbausteine
          </span>
          <span className="text-[11px] text-zinc-500">5 / 6 abgedeckt</span>
        </div>
        <ul className="divide-y divide-zinc-100 text-[12px]">
          <MustHaveRow label="Profiling / Standortbestimmung" covered />
          <MustHaveRow label="Zielarbeit" covered />
          <MustHaveRow label="Strategie + Handlungsperspektiven" covered />
          <MustHaveRow label="Marktorientierung" covered={false} />
          <MustHaveRow label="Prozessbegleitung" covered />
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800">
            Pathologisierung
          </span>
          <span className="text-zinc-500">Abschnitt: Fazit</span>
        </div>
        <blockquote className="mt-2 rounded border-l-2 border-rose-300 bg-white px-3 py-2 text-[12px] italic text-zinc-700">
          &bdquo;Frau S. wirkt emotional labil und überfordert.&ldquo;
        </blockquote>
        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Umformulierung (erango-Standard)
          </div>
          <p className="mt-1 text-[12px] text-zinc-800">
            Frau S. zeigte Herausforderungen in der Selbstregulation —
            entsprechende Impulse zur Stabilisierung wurden gesetzt.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-500">3 Vorschläge offen</span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-700">
            Markieren
          </span>
          <span className="rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white">
            Übernehmen →
          </span>
        </div>
      </div>
    </div>
  );
}

function MustHaveRow({
  label,
  covered,
}: {
  label: string;
  covered: boolean;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      {covered ? (
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12l5 5 9-11"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-amber-400" />
      )}
      <span className={covered ? "text-zinc-800" : "text-amber-900"}>
        {label}
      </span>
    </li>
  );
}
