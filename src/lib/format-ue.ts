/**
 * Deutsche Formatierung von UE-Werten: 2 → "2", 2.5 → "2,5".
 *
 * Bewusst **pur** (kein `server-only`), damit sowohl Server-Seiten als auch
 * Client-Komponenten (z.B. der öffentliche /tnb-Konfigurator) sie nutzen können.
 */
export function formatUeDE(value: number): string {
  if (!Number.isFinite(value)) return "";
  return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)).replace(
    ".",
    ",",
  );
}
