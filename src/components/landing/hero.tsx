export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-zinc-50 to-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Für AVGS-Coaches und Weiterbildungsträger
          </span>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
            Rechtssichere AfA-Nachweise.{" "}
            <span className="text-zinc-500">Ohne Papier.</span>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Stundennachweise für AVGS-Maßnahmen digital erfassen, von Coach und
            Teilnehmer:innen signieren, als A4-PDF mit fortgeschrittener
            elektronischer Signatur (FES) an die Agentur für Arbeit übermitteln
            — alles in einem Flow.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Warteliste beitreten
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            <a
              href="#workflow"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              So funktioniert&apos;s
            </a>
          </div>

          <dl className="grid grid-cols-3 gap-6 pt-6 text-sm">
            <div>
              <dt className="text-zinc-500">AfA-Konform</dt>
              <dd className="mt-1 font-medium text-zinc-950">FES nach eIDAS</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Hosting</dt>
              <dd className="mt-1 font-medium text-zinc-950">EU (Frankfurt)</dd>
            </div>
            <div>
              <dt className="text-zinc-500">DSGVO</dt>
              <dd className="mt-1 font-medium text-zinc-950">AVV verfügbar</dd>
            </div>
          </dl>
        </div>

        <div className="relative">
          <MockupPreview />
        </div>
      </div>
    </section>
  );
}

/**
 * Dekoratives Stundennachweis-Mockup als SVG — zeigt die Kernidee
 * (Kopfblock, Termin-Tabelle mit Signaturen, FES-Siegel) ohne echtes
 * Screenshot-Asset. Verzichtet bewusst auf `<img>` damit wir keine Blob-/
 * CDN-Abhängigkeit für die öffentliche Startseite bauen.
 */
function MockupPreview() {
  return (
    <div className="rounded-2xl border border-zinc-300 bg-white p-4 shadow-xl shadow-zinc-950/5 sm:p-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Stundennachweis
          </div>
          <div className="mt-0.5 text-sm font-semibold text-zinc-950">
            AVGS Bewerbungstraining Intensiv
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12l5 5 9-11"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          FES-signiert
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <dt className="text-zinc-500">AVGS-Nr.</dt>
          <dd className="text-zinc-900">123-456-789-012</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Bedarfsträger</dt>
          <dd className="text-zinc-900">Jobcenter Singen</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Teilnehmer:in</dt>
          <dd className="text-zinc-900">Maria Schmidt</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Kunden-Nr.</dt>
          <dd className="text-zinc-900">160B29588</dd>
        </div>
      </dl>

      <table className="mt-4 w-full text-[11px]">
        <thead className="border-y border-zinc-200 bg-zinc-50 text-zinc-600">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Datum</th>
            <th className="px-2 py-1.5 text-right font-medium">UE</th>
            <th className="px-2 py-1.5 text-left font-medium">Inhalt</th>
            <th className="px-2 py-1.5 text-center font-medium">Coach</th>
            <th className="px-2 py-1.5 text-center font-medium">TN</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-800">
          <MockupRow date="14.04." ue="2" topic="Lebenslauf-Review" coach tn />
          <MockupRow date="16.04." ue="2" topic="Bewerbungstraining" coach tn />
          <MockupRow date="18.04." ue="2,5" topic="Zielklärung" coach tn />
          <MockupRow date="19.04." ue="2" topic="Vorstellungsgespräch" coach tn={false} />
        </tbody>
      </table>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>4 von 40 UE geleistet</span>
        <span>Live-Status: wartet auf Teilnehmer:in</span>
      </div>
    </div>
  );
}

function MockupRow({
  date,
  ue,
  topic,
  coach,
  tn,
}: {
  date: string;
  ue: string;
  topic: string;
  coach: boolean;
  tn: boolean;
}) {
  return (
    <tr>
      <td className="px-2 py-1.5">{date}</td>
      <td className="px-2 py-1.5 text-right">{ue}</td>
      <td className="px-2 py-1.5 text-zinc-600">{topic}</td>
      <td className="px-2 py-1.5 text-center">
        {coach ? (
          <CheckMark />
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        {tn ? (
          <CheckMark />
        ) : (
          <span className="inline-block h-1.5 w-6 rounded-full bg-amber-200" />
        )}
      </td>
    </tr>
  );
}

function CheckMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className="mx-auto text-emerald-600"
      aria-hidden
    >
      <path
        d="M5 12l5 5 9-11"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
