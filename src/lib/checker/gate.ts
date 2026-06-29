import type { CheckerResult, Violation } from "./types";

/**
 * Hard-Block-Gate-Helfer für den Zwei-Kategorien-Checker. Geteilt zwischen
 * Kurs-Editor und Schnell-Check, damit beide Submit-Pfade identisch ticken.
 *
 * Modell: Ein `hard_block` (Sensibel) blockiert das Einreichen — der Coach
 * löst ihn auf, indem er ihn entweder im Text korrigiert (dann ist er beim
 * Re-Check weg) ODER als **Fehlalarm mit Begründung** wegklickt. Wegklicken
 * geht NIE ohne Begründung (der Bildungsträger prüft die Begründung nach).
 * Soft-Flags + fehlende Pflichtbausteine blockieren nie.
 */

/** Mindestlänge der Fehlalarm-Begründung pro Sensibel-Stelle. */
export const HARD_BLOCK_REASON_MIN = 10;
const OVERRIDE_REASON_MAX = 500;

export function hardBlocks(result: CheckerResult): Violation[] {
  return result.violations.filter((v) => v.severity === "hard_block");
}

/** Eine Sensibel-Stelle gilt als aufgelöst, wenn ihre Begründung ≥10 Zeichen hat. */
export function isHardBlockDismissed(
  id: string,
  dismissReasons: Readonly<Record<string, string>>,
): boolean {
  return (dismissReasons[id]?.trim().length ?? 0) >= HARD_BLOCK_REASON_MIN;
}

/**
 * Hard-Blocks, die der Coach noch NICHT aufgelöst hat. Aufgelöst ist eine
 * Stelle, wenn sie
 *  - mit Fehlalarm-Begründung (≥10 Zeichen) weggeklickt wurde, ODER
 *  - der Vorschlag übernommen wurde (`appliedIds`, Text bereits entschärft) —
 *    so muss der Coach nach „Im Text übernehmen" nicht erst erneut prüfen.
 * Beim Re-Check verschwinden korrigierte Stellen ohnehin aus `result`.
 */
export function activeHardBlocks(
  result: CheckerResult,
  dismissReasons: Readonly<Record<string, string>>,
  appliedIds: ReadonlySet<string> = new Set(),
): Violation[] {
  return hardBlocks(result).filter(
    (v) => !isHardBlockDismissed(v.id, dismissReasons) && !appliedIds.has(v.id),
  );
}

/**
 * Die Begründung, die an den (server-seitig severity-basierten) Gate gesendet
 * wird und im BT-Detail-View/PDF protokolliert wird: pro weggeklickter
 * Sensibel-Stelle die Coach-Begründung, zusammengeführt. `null`, wenn keine
 * Stelle weggeklickt wurde (dann lag entweder kein Hard-Block vor oder er
 * wurde im Text korrigiert).
 */
export function resolveHardBlockOverrideReason(
  result: CheckerResult,
  dismissReasons: Readonly<Record<string, string>>,
): string | null {
  const dismissed = hardBlocks(result).filter((v) =>
    isHardBlockDismissed(v.id, dismissReasons),
  );
  if (dismissed.length === 0) return null;

  const parts = dismissed.map(
    (v) => `„${v.quote}": ${dismissReasons[v.id].trim()}`,
  );
  return `Fehlalarm-Begründung — ${parts.join(" | ")}`.slice(
    0,
    OVERRIDE_REASON_MAX,
  );
}
