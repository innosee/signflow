/**
 * Reine Entscheidung, ob beim Re-Upload einer Unterschrift der **alte** Blob
 * gelöscht werden darf. Ausgelagert aus den Upload-Routen (server-only, db),
 * damit die beweisrechtlich kritische Regel unit-testbar ist.
 *
 * Hintergrund: `signatures.signature_url` ist nur ein Pointer auf denselben
 * Object-Key wie `users/participants.signature_url` zum Sign-Zeitpunkt — keine
 * Bildkopie. Wird der alte Blob gelöscht, obwohl noch signatures-Zeilen darauf
 * zeigen, sind alle bisherigen (ggf. abgeschlossenen) Nachweise kaputt.
 *
 * Gelöscht wird NUR, wenn ALLE gelten:
 *  - es gibt überhaupt einen Vorgänger (`previousUrl`),
 *  - der Upload hat den Wert geändert (`previousUrl !== newUrl`),
 *  - keine signatures-Zeile referenziert den alten Key mehr (`!isStillReferenced`).
 */
export function shouldDeleteReplacedSignatureBlob(params: {
  previousUrl: string | null | undefined;
  newUrl: string;
  isStillReferenced: boolean;
}): boolean {
  const { previousUrl, newUrl, isStillReferenced } = params;
  if (!previousUrl) return false; // Erst-Upload: nichts zu löschen
  if (previousUrl === newUrl) return false; // unverändert
  if (isStillReferenced) return false; // noch als Snapshot in Benutzung
  return true; // echter Waise
}
