/**
 * Deutsches Datumsformat `TT.MM.JJJJ` (mit führenden Nullen) in der Zeitzone
 * Europe/Berlin. Bewusst zweistellig — `toLocaleDateString("de-DE")` ohne
 * Optionen liefert „30.6.2026", auf den rechtlichen Dokumenten wollen wir
 * „30.06.2026". Zeitzone fixiert, damit ein UTC-Timestamp nicht abends auf den
 * Vortag kippt.
 */
export function formatDateDE(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}
