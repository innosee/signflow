import {
  MUST_HAVE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  type CheckerResult,
  type CheckerSection,
} from "@/lib/checker/types";

const SECTION_LABELS: Record<CheckerSection, string> = {
  teilnahme: "Teilnahme und Mitarbeit",
  ablauf: "Ablauf und Inhalte",
  fazit: "Fazit und Empfehlungen",
};

export function FeedbackDetails({ result }: { result: CheckerResult }) {
  const hasViolations = result.violations.length > 0;
  const openMustHaves = result.mustHaves.filter((m) => !m.covered);

  return (
    <div className="space-y-6">
      <MustHaveChecklist mustHaves={result.mustHaves} />

      {hasViolations && (
        <section className="rounded-xl border border-zinc-300 bg-white">
          <header className="border-b border-zinc-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-zinc-900">
              Unzulässige Stellen ({result.violations.length})
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Diese Formulierungen verstoßen gegen die Vorgaben des
              Bildungsträgers. Übernimm die Umformulierungs-Vorschläge oder
              passe sinngemäß an.
            </p>
          </header>
          <ul className="divide-y divide-zinc-200">
            {result.violations.map((v) => (
              <li key={v.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800">
                    {VIOLATION_CATEGORY_LABELS[v.category]}
                  </span>
                  <span className="text-zinc-500">
                    Abschnitt: {SECTION_LABELS[v.section]}
                  </span>
                  <span className="text-zinc-500">· {v.rule}</span>
                </div>
                <figure className="mt-3 rounded-lg border-l-4 border-rose-300 bg-rose-50/60 px-4 py-3">
                  <blockquote className="text-sm italic text-zinc-800">
                    &bdquo;{v.quote}&ldquo;
                  </blockquote>
                </figure>
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                  <div className="text-xs font-medium text-emerald-900">
                    Umformulierung nach erango-Standard:
                  </div>
                  <p className="mt-1 text-sm text-zinc-800">{v.suggestion}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openMustHaves.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
          <h3 className="text-sm font-semibold text-amber-900">
            Fehlende Pflichtbausteine ({openMustHaves.length})
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            Der Bericht muss folgende Inhalte sinngemäß abbilden — bitte
            ergänzen:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
            {openMustHaves.map((m) => (
              <li key={m.topic} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5">•</span>
                <span>
                  <span className="font-medium">
                    {MUST_HAVE_LABELS[m.topic]}
                  </span>
                  {m.hint && <span className="ml-1 text-amber-800">— {m.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.tonalityFeedback && (
        <section className="rounded-xl border border-zinc-300 bg-zinc-50 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            Hinweis zur Tonalität
          </h3>
          <p className="mt-1 text-sm text-zinc-700">
            {result.tonalityFeedback}
          </p>
        </section>
      )}
    </div>
  );
}

function MustHaveChecklist({
  mustHaves,
}: {
  mustHaves: CheckerResult["mustHaves"];
}) {
  const coveredCount = mustHaves.filter((m) => m.covered).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          Pflichtbausteine
        </h3>
        <span className="text-xs text-zinc-500">
          {coveredCount} von {mustHaves.length} abgedeckt
        </span>
      </header>
      <ul className="divide-y divide-zinc-100">
        {mustHaves.map((m) => (
          <li
            key={m.topic}
            className="flex items-center gap-3 px-5 py-3 text-sm"
          >
            {m.covered ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-300" />
            )}
            <span className={m.covered ? "text-zinc-900" : "text-zinc-500"}>
              {MUST_HAVE_LABELS[m.topic]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
