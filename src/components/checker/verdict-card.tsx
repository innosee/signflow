import type { CheckerResult } from "@/lib/checker/types";

export function VerdictCard({ result }: { result: CheckerResult }) {
  const isPass = result.status === "pass";

  const violationCount = result.violations.length;
  const openMustHaves = result.mustHaves.filter((m) => !m.covered).length;

  return (
    <div
      className={`rounded-2xl border p-6 ${
        isPass
          ? "border-emerald-300 bg-linear-to-br from-emerald-50 via-white to-emerald-50"
          : "border-rose-300 bg-linear-to-br from-rose-50 via-white to-rose-50"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
            isPass
              ? "bg-emerald-500 text-white"
              : "bg-rose-500 text-white"
          }`}
        >
          {isPass ? (
            <svg
              width="28"
              height="28"
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
          ) : (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={`text-xl font-semibold ${
              isPass ? "text-emerald-900" : "text-rose-900"
            }`}
          >
            {isPass
              ? "Danke für die Einreichung!"
              : "Leider können wir den Bericht so nicht verarbeiten."}
          </h2>
          <p
            className={`mt-1 text-sm ${
              isPass ? "text-emerald-800" : "text-rose-800"
            }`}
          >
            {isPass
              ? "Der Bericht erfüllt die inhaltlichen und tonalen Anforderungen des Bildungsträgers und kann so eingereicht werden."
              : `${violationCount === 0 ? "Es wurden" : `${violationCount} ${violationCount === 1 ? "Regelverstoß" : "Regelverstöße"} und`} ${openMustHaves} ${openMustHaves === 1 ? "fehlender Pflichtbaustein" : "fehlende Pflichtbausteine"} gefunden. Schau dir die Details unten an und passe die markierten Stellen an.`}
          </p>
        </div>
      </div>
    </div>
  );
}
