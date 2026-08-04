/**
 * Reine Domänen-Logik der Sign-/Seal-State-Machine.
 *
 * Bewusst OHNE DB-/`server-only`-Importe gehalten, damit diese Kern-Invarianten
 * (Termin-Status, Freigabe-Gate, FES-Siegel-Gates) unit-testbar sind — ein Test
 * von `session-status.ts` o.ä. würde sonst `src/db` und damit ein gesetztes
 * `DATABASE_URL` nachziehen. Die Aufrufer reichen bereits aufgelöste DB-Werte
 * herein; hier wird nur entschieden.
 */

export type SessionStatus = "pending" | "coach_signed" | "completed";

/**
 * Leitet den Status eines Termins aus den vorliegenden Signaturen ab
 * (1:1-Modell — ein Termin gehört genau dem einen Kunden des Kurses):
 *   - keine Coach-Signatur          → "pending"
 *   - Coach signiert, Kunde offen   → "coach_signed"
 *   - Coach + Kunde signiert        → "completed"
 */
export function deriveSessionStatus(
  coachSigned: boolean,
  participantSigned: boolean,
): SessionStatus {
  if (!coachSigned) return "pending";
  if (participantSigned) return "completed";
  return "coach_signed";
}

export type ApprovalGate = "ready" | "participant_open" | "coach_open";

/**
 * Entscheidet, ob der Kunde den Nachweis final freigeben darf — und falls
 * nicht, an WEM es liegt:
 *   - "ready"            → alle Termine vollständig (Coach + Kunde) → Freigabe ok
 *   - "participant_open" → der Kunde hat selbst noch Termine offen → erst signieren
 *   - "coach_open"       → Kunde fertig, aber der Coach hat noch offene Termine → warten
 *
 * Annahme: mindestens ein Termin. Den Leer-Fall ("Kurs ohne Termine") behandeln
 * die Aufrufer separat, bevor sie hier klassifizieren.
 */
export function classifyApprovalGate(
  sessions: ReadonlyArray<{ status: SessionStatus; participantSigned: boolean }>,
): ApprovalGate {
  const notCompleted = sessions.filter((s) => s.status !== "completed");
  if (notCompleted.length === 0) return "ready";
  const participantHasOpen = notCompleted.some((s) => !s.participantSigned);
  return participantHasOpen ? "participant_open" : "coach_open";
}

export type SealBlock =
  | "anw_check_missing"
  | "not_abgeschlossen"
  | "review_not_approved"
  | "no_sessions"
  | "sessions_incomplete"
  | "analog_not_confirmed";

export type SignatureMode = "digital" | "analog";

/**
 * Prüft die kurs-internen FES-Siegel-Gates (in Reihenfolge) und liefert den
 * ersten verletzten Block — oder `null`, wenn alle erfüllt sind. Die
 * DB-abhängigen Zusatz-Checks (richtiger Coach pro Termin, Kunden-Freigabe)
 * bleiben bewusst im Aufrufer.
 *
 * Analog-Modus (`signatureMode = 'analog'`): im Papier-Fallback gibt es keine
 * digitalen Session-Signaturen. Statt „alle Termine vollständig" muss dann die
 * Scan-Bestätigung des Coaches vorliegen (`analogConfirmedAt`). Der
 * `no_sessions`-Check bleibt — auch ein analoger Nachweis braucht ≥1 Termin.
 * `signatureMode` ist optional und defaulted auf `digital`, damit bestehende
 * Aufrufer unverändert bleiben.
 */
export function evaluateSealReadiness(input: {
  anwCheckPassedAt: Date | string | null;
  abgeschlossenAt: Date | string | null;
  reviewStatus: string;
  sessionStatuses: ReadonlyArray<SessionStatus>;
  signatureMode?: SignatureMode;
  analogConfirmedAt?: Date | string | null;
}): SealBlock | null {
  if (!input.anwCheckPassedAt) return "anw_check_missing";
  if (!input.abgeschlossenAt) return "not_abgeschlossen";
  if (input.reviewStatus !== "approved") return "review_not_approved";
  if (input.sessionStatuses.length === 0) return "no_sessions";
  if (input.signatureMode === "analog") {
    if (!input.analogConfirmedAt) return "analog_not_confirmed";
    return null;
  }
  if (input.sessionStatuses.some((s) => s !== "completed")) {
    return "sessions_incomplete";
  }
  return null;
}
