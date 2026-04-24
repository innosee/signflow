import type { AnonEntity } from "./anonymize";
import type { CheckerResult, Violation } from "./types";

/**
 * Ersetzt Placeholder (`[NAME_1]`, `[ORT_2]`, …) im Azure-Feedback wieder durch
 * die Original-Werte aus dem Browser-Mapping. Wichtig, damit der Coach im UI
 * die Originale sieht und nicht abstrakte Platzhalter.
 *
 * Die Mapping-Tabelle bleibt im Browser-RAM und verlässt das Gerät nie.
 */
export function reverseMap(
  entities: AnonEntity[],
  result: CheckerResult,
): CheckerResult {
  if (entities.length === 0) return result;

  // Längste Placeholder zuerst, damit `[NAME_10]` nicht von `[NAME_1]` zerlegt wird.
  const sorted = [...entities].sort(
    (a, b) => b.placeholder.length - a.placeholder.length,
  );

  const restore = (text: string): string => {
    let out = text;
    for (const e of sorted) {
      if (out.includes(e.placeholder)) {
        out = out.split(e.placeholder).join(e.original);
      }
    }
    return out;
  };

  const violations: Violation[] = result.violations.map((v) => ({
    ...v,
    quote: restore(v.quote),
    suggestion: restore(v.suggestion),
  }));

  const tonalityFeedback =
    result.tonalityFeedback !== undefined
      ? restore(result.tonalityFeedback)
      : undefined;

  return {
    ...result,
    violations,
    ...(tonalityFeedback !== undefined ? { tonalityFeedback } : {}),
  };
}
