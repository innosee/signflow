import type { CheckerResult } from "@/lib/checker/types";

function buildRevisionMessage(
  hardBlockCount: number,
  openMustHaves: number,
): string {
  const parts: string[] = [];
  if (hardBlockCount === 1) parts.push("1 harter Regelverstoß");
  else if (hardBlockCount > 1) parts.push(`${hardBlockCount} harte Regelverstöße`);
  if (openMustHaves === 1) parts.push("1 fehlender Pflichtbaustein");
  else if (openMustHaves > 1)
    parts.push(`${openMustHaves} fehlende Pflichtbausteine`);

  const joined =
    parts.length === 2 ? `${parts[0]} und ${parts[1]}` : parts.join("");
  const verb = hardBlockCount + openMustHaves === 1 ? "wurde" : "wurden";
  return `Es ${verb} ${joined} gefunden. Bitte die unten markierten Stellen vor dem Einreichen korrigieren.`;
}

function buildPassMessage(softFlagCount: number): string {
  if (softFlagCount === 0) {
    return "Der Bericht erfüllt die inhaltlichen und tonalen Anforderungen und kann eingereicht werden.";
  }
  if (softFlagCount === 1) {
    return "Der Bericht kann eingereicht werden. Ein Formulierungs-Hinweis wurde gefunden — du kannst ihn vor dem Abschicken umformulieren oder dem Bildungsträger mitgeben.";
  }
  return `Der Bericht kann eingereicht werden. ${softFlagCount} Formulierungs-Hinweise wurden gefunden — du kannst sie vor dem Abschicken umformulieren oder dem Bildungsträger mitgeben.`;
}

export function VerdictCard({ result }: { result: CheckerResult }) {
  const isPass = result.status === "pass";

  const hardBlockCount = result.violations.filter(
    (v) => v.severity === "hard_block",
  ).length;
  const softFlagCount = result.violations.filter(
    (v) => v.severity === "soft_flag",
  ).length;
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
              ? buildPassMessage(softFlagCount)
              : buildRevisionMessage(hardBlockCount, openMustHaves)}
          </p>
        </div>
      </div>
    </div>
  );
}
