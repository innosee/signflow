/**
 * Persistiertes Snapshot-Format für Abschlussberichte. Gehört in die
 * `abschlussberichte.check_snapshot`-Spalte (jsonb).
 *
 * Version 2 enthält zusätzlich zum `CheckerResult` auch den exakten
 * Input, gegen den geprüft wurde — so kann die UI beim nächsten Öffnen
 * des BER entscheiden, ob ein erneuter Azure-Check nötig ist. Wenn der
 * aktuelle Textstand 1:1 dem gespeicherten Input entspricht, wird
 * nichts neu berechnet (Token-Ersparnis).
 *
 * Ältere BERs (pre-v2) haben nur das Result als Root-Objekt. Die
 * Read-Helfer unten kommen mit beiden Formen klar.
 */
import type { CheckerInput, CheckerResult, Violation } from "./types";

export type CheckSnapshotV2 = {
  v: 2;
  input: CheckerInput;
  result: CheckerResult;
};

export function buildSnapshot(
  input: CheckerInput,
  result: CheckerResult,
): CheckSnapshotV2 {
  return { v: 2, input, result };
}

/** Liefert das Result — egal ob Legacy (raw result) oder v2. */
export function readSnapshotResult(raw: unknown): CheckerResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // v2: { v: 2, input, result }
  if (obj.v === 2 && obj.result && typeof obj.result === "object") {
    return obj.result as CheckerResult;
  }
  // Legacy: obj ist direkt das Result
  if ("status" in obj && "mustHaves" in obj && "violations" in obj) {
    return obj as CheckerResult;
  }
  return null;
}

/** Nur v2-Snapshots haben den Input. Legacy gibt null zurück. */
export function readSnapshotInput(raw: unknown): CheckerInput | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 2) return null;
  const input = obj.input;
  if (
    !input ||
    typeof input !== "object" ||
    typeof (input as Record<string, unknown>).teilnahme !== "string" ||
    typeof (input as Record<string, unknown>).ablauf !== "string" ||
    typeof (input as Record<string, unknown>).fazit !== "string"
  ) {
    return null;
  }
  return input as CheckerInput;
}

/**
 * Shortcut für den Bildungsträger-Detail-View: zieht soft_flags aus der
 * Snapshot-Result-Struktur. Robust gegen beide Formen.
 */
export function readSoftFlags(raw: unknown): Violation[] {
  const result = readSnapshotResult(raw);
  if (!result || !Array.isArray(result.violations)) return [];
  return result.violations.filter((v) => v && v.severity === "soft_flag");
}

/** Strikter Vergleich: alle drei Abschnitte 1:1 identisch? */
export function inputsEqual(
  a: CheckerInput | null,
  b: CheckerInput | null,
): boolean {
  if (!a || !b) return false;
  return (
    a.teilnahme === b.teilnahme &&
    a.ablauf === b.ablauf &&
    a.fazit === b.fazit
  );
}
