/**
 * Reine, unit-testbare Datenschutz-Regeln rund um das Analytics-Script.
 * Bewusst ohne React-/next-Importe ausgelagert aus den Client-Components, damit
 * die sicherheitsrelevanten Entscheidungen im vitest-Scope prüfbar sind.
 */

/**
 * Darf das Analytics-Script auf diesem Pfad geladen werden?
 *
 * **NEIN auf `/sign/<token>`**: Der Magic-Link-Token steht dort im Pfad und ist
 * 7 Tage gültig (voller Zugriff auf TN-Daten + Signatur). Ein Pageview-Ping mit
 * URL würde ihn an das Analytics-System leaken. Auf allen anderen Pfaden: ja.
 *
 * `pathname` kann in seltenen Render-Phasen null/undefined sein — dann wird
 * (wie im bisherigen Verhalten) geladen, da es kein `/sign/`-Pfad ist.
 */
export function shouldLoadAnalytics(
  pathname: string | null | undefined,
): boolean {
  return !pathname?.startsWith("/sign/");
}

/**
 * Baut das Payload für das Such-Analytics-Event im Kunden-Cockpit.
 *
 * Kritisch: Der Suchstring selbst (dort wird nach **Teilnehmernamen** gesucht)
 * darf NIE ins Analytics-System. Rückgabe enthält nur die Länge als grobes
 * Nutzungssignal, oder `null`, wenn (nach Trim) < 2 Zeichen — dann wird gar
 * kein Event gefeuert.
 */
export function buildSearchEventPayload(
  rawValue: string,
): { qLength: number } | null {
  const q = rawValue.trim();
  if (q.length < 2) return null;
  return { qLength: q.length };
}
