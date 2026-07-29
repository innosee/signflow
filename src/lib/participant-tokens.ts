import "server-only";

import crypto from "node:crypto";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import type { DocumentTypeId } from "@/lib/documents/config";
import { sendParticipantMagicLink } from "@/lib/email";
import {
  composeMagicLinkSms,
  isSmsEnabled,
  isValidE164,
  sendSms,
} from "@/lib/sms";

export type NotificationChannel = "email" | "sms";

/**
 * Reduziert den vom Caller gewünschten Channel auf das, was tatsächlich
 * zustellbar ist. Zwei Filter:
 *  1. **Feature-Gate**: ist `SMS_ENABLED=true` nicht gesetzt, wird egal
 *     was der Caller will, immer Email zurückgegeben — Defense-in-Depth
 *     gegen UI-Bypass durch veraltete Tabs / direkte Action-Aufrufe.
 *  2. **Deliverability**: SMS ohne gültige Nummer fällt still auf Email
 *     zurück. (Strikteres Verhalten — Throw — kann der Caller bei Bedarf
 *     selbst per Vorab-Check umsetzen.)
 */
function effectiveChannel(
  requested: NotificationChannel,
  participantPhone: string | null,
): NotificationChannel {
  if (!isSmsEnabled()) return "email";
  if (
    requested === "sms" &&
    (!participantPhone || !isValidE164(participantPhone))
  ) {
    return "email";
  }
  return requested;
}

// Magic-Link-Gültigkeit. 7 Tage (statt vormals 24 h) aus Usability-Gründen —
// Teilnehmer brauchen realistisch länger als einen Tag. DSGVO-vertretbar, weil
// der Zugriff zusätzlich durch gehashten Token, kurs-scoped Bindung, aktive
// Bestätigung + Zeitstempel + IP + Audit-Log je Signatur abgesichert ist
// (Begründung gehört ins VVT/Datenschutzerklärung). Einzige Source of Truth der
// TTL — speist Sign-Link UND Preview-Freigabe.
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Erzeugt einen neuen Magic-Link-Token für die Paarung (course × participant).
 *
 * Alte Links werden bewusst NICHT mehr invalidiert (geändert 2026-06-19): jeder
 * ausgestellte Link bleibt bis zu seinem eigenen Ablauf (7 Tage) gültig. Damit
 * funktioniert auch eine kürzlich erhaltene Mail noch, wenn der Coach
 * zwischenzeitlich erneut benachrichtigt hat — mehrere aktive Links pro Paarung
 * sind erlaubt. Sie zeigen alle auf dieselbe Sign-Seite (aktueller Stand der
 * offenen Sessions), sind also funktional gleichwertig. Gültigkeit hängt nur
 * noch an `expires_at`; `used_at` bleibt für einen späteren expliziten
 * Revoke-Flow reserviert.
 */
export async function createParticipantMagicLink(params: {
  courseId: string;
  participantId: string;
}): Promise<{ token: string; url: string }> {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(schema.participantAccessTokens).values({
    courseId: params.courseId,
    participantId: params.participantId,
    tokenHash,
    expiresAt,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { token, url: `${base}/sign/${token}` };
}

/**
 * High-level helper: generiert einen frischen Link UND verschickt die
 * Magic-Link-Mail. Wird vom Coach-Dashboard per "Teilnehmer benachrichtigen"
 * aufgerufen (manuell ausgelöst, kein Cron im V1).
 *
 * Die (course, participant)-Paarung wird gegen die 1:1-Bindung
 * `courses.participant_id` geprüft — sonst ginge unter Umständen eine Mail
 * raus, während `resolveParticipantToken()` den Link später verwerfen würde.
 */
export async function sendParticipantInvite(params: {
  courseId: string;
  participantId: string;
  /**
   * Zustellkanal. Default `"email"` für Bestandsverhalten. SMS ist
   * Fallback für Teilnehmer, die mit Email-Clients/Spam-Ordnern
   * überfordert sind — siehe Auto-Memory `project_participant_delivery_channels`.
   */
  channel?: NotificationChannel;
}): Promise<{ usedChannel: NotificationChannel }> {
  const requested: NotificationChannel = params.channel ?? "email";

  const rows = await db
    .select({
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      participantPhone: schema.participants.phone,
      courseTitle: schema.courses.title,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, params.courseId),
        eq(schema.courses.participantId, params.participantId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Teilnehmer ist nicht in diesem Kurs eingeschrieben.");

  // Channel-Resolution VOR dem Token-Insert: Feature-Gate + Deliverability
  // werden hier zentral entschieden, sodass ein SMS-Wunsch ohne aktivierten
  // Flag (oder ohne Phone) still auf Email umgeleitet wird, statt an einer
  // Mid-Flight-Validierung zu sterben — wäre fatal, weil der Token-Insert
  // den vorherigen Magic-Link bereits invalidiert hat.
  const channel = effectiveChannel(requested, row.participantPhone);

  const { url } = await createParticipantMagicLink(params);

  if (channel === "sms") {
    await sendSms({
      to: row.participantPhone!,
      body: composeMagicLinkSms({
        participantName: row.participantName,
        courseTitle: row.courseTitle,
        url,
      }),
    });
    return { usedChannel: "sms" };
  }

  await sendParticipantMagicLink({
    to: row.participantEmail,
    participantName: row.participantName,
    courseTitle: row.courseTitle,
    url,
  });
  return { usedChannel: "email" };
}

export type ResolvedToken = {
  tokenId: string;
  courseId: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  /**
   * Einmal angelegte Teilnehmer-Unterschrift. `null` → der Teilnehmer hat
   * noch nie unterschrieben und muss beim Öffnen des Magic-Links zuerst
   * seine Unterschrift via Canvas anlegen, bevor er Sessions bestätigen
   * kann. Ist die URL gesetzt, wird sie als Snapshot in `signatures` pro
   * Session übernommen (analog zum Coach-Flow).
   */
  participantSignatureUrl: string | null;
  courseTitle: string;
  /**
   * Finale Freigabe des Teilnehmers nach Preview (siehe CLAUDE.md Schritt 8).
   * `true` → Teilnehmer hat das fertige Dokument gesehen und freigegeben,
   * FES kann vom Coach ausgelöst werden.
   */
  hasApproved: boolean;
  sessions: Array<{
    id: string;
    sessionDate: string;
    topic: string;
    anzahlUe: string;
    modus: "praesenz" | "online";
    isErstgespraech: boolean;
    hasParticipantSignature: boolean;
    /**
     * Vollständigkeit des Termins (`pending` = Coach offen, `coach_signed` =
     * Coach signiert/TN offen, `completed` = beide). Wird für die finale
     * Freigabe gebraucht: der TN darf erst freigeben, wenn ALLE Termine
     * `completed` sind — sonst gäbe er ein Dokument frei, dem noch
     * Coach-Signaturen fehlen, die danach noch dazukämen.
     */
    status: "pending" | "coach_signed" | "completed";
  }>;
  /**
   * Kunde-Dokumente (digitalisierte erango-Formulare), die der Coach zur
   * Unterschrift freigegeben hat (`status = 'active'`) bzw. bereits
   * abgeschlossen sind. Drafts (Coach füllt noch aus) werden dem Teilnehmer
   * NICHT gezeigt.
   */
  documents: Array<{
    id: string;
    type: DocumentTypeId;
    status: "active" | "completed";
    hasParticipantSignature: boolean;
  }>;
};

/**
 * Validiert einen Magic Link und gibt den Kurs-Kontext inkl. aller Sessions
 * (signiert + noch offen) zurück. Verbraucht den Token NICHT — innerhalb der
 * 7-Tage-Gültigkeit kann der Teilnehmer beliebig viele Sessions signieren.
 */
export async function resolveParticipantToken(
  token: string,
): Promise<ResolvedToken | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      tokenId: schema.participantAccessTokens.id,
      courseId: schema.participantAccessTokens.courseId,
      participantId: schema.participantAccessTokens.participantId,
      participantName: schema.participants.name,
      participantEmail: schema.participants.email,
      participantSignatureUrl: schema.participants.signatureUrl,
      courseTitle: schema.courses.title,
    })
    .from(schema.participantAccessTokens)
    .innerJoin(
      schema.courses,
      and(
        eq(schema.courses.id, schema.participantAccessTokens.courseId),
        // 1:1-Defense: der Token-Teilnehmer muss der Kunde des Kurses sein.
        eq(
          schema.courses.participantId,
          schema.participantAccessTokens.participantId,
        ),
      ),
    )
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.participantAccessTokens.participantId),
    )
    .where(
      and(
        eq(schema.participantAccessTokens.tokenHash, tokenHash),
        isNull(schema.participantAccessTokens.usedAt),
        gt(schema.participantAccessTokens.expiresAt, now),
      ),
    )
    .limit(1);

  const head = rows[0];
  if (!head) return null;

  // 1:1: Alle nicht-gelöschten Termine des Kurses gehören dem einen Kunden —
  // keine Enrollment-/Anwesenheits-Tabelle mehr.
  const rawSessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      topic: schema.sessions.topic,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
      status: schema.sessions.status,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, head.courseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  const signedSessionIds = new Set(
    (
      await db
        .select({ sessionId: schema.signatures.sessionId })
        .from(schema.signatures)
        .innerJoin(
          schema.sessions,
          eq(schema.sessions.id, schema.signatures.sessionId),
        )
        .where(
          and(
            eq(schema.sessions.courseId, head.courseId),
            eq(schema.signatures.participantId, head.participantId),
            eq(schema.signatures.signerType, "participant"),
          ),
        )
    ).map((r) => r.sessionId),
  );

  const [approval] = await db
    .select({ id: schema.participantApprovals.id })
    .from(schema.participantApprovals)
    .where(
      and(
        eq(schema.participantApprovals.courseId, head.courseId),
        eq(schema.participantApprovals.participantId, head.participantId),
      ),
    )
    .limit(1);

  // Kunde-Dokumente: nur die vom Coach freigegebenen (active) oder bereits
  // abgeschlossenen (completed) — Drafts bleiben dem Teilnehmer verborgen.
  const docRows = await db
    .select({
      id: schema.documents.id,
      type: schema.documents.type,
      status: schema.documents.status,
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.courseId, head.courseId),
        isNull(schema.documents.deletedAt),
        inArray(schema.documents.status, ["active", "completed"]),
      ),
    )
    .orderBy(asc(schema.documents.createdAt));

  const signedDocIds = new Set(
    docRows.length
      ? (
          await db
            .select({ documentId: schema.documentSignatures.documentId })
            .from(schema.documentSignatures)
            .where(
              and(
                inArray(
                  schema.documentSignatures.documentId,
                  docRows.map((d) => d.id),
                ),
                eq(schema.documentSignatures.signerType, "participant"),
              ),
            )
        ).map((r) => r.documentId)
      : [],
  );

  return {
    tokenId: head.tokenId,
    courseId: head.courseId,
    participantId: head.participantId,
    participantName: head.participantName,
    participantEmail: head.participantEmail,
    participantSignatureUrl: head.participantSignatureUrl ?? null,
    courseTitle: head.courseTitle,
    hasApproved: !!approval,
    sessions: rawSessions.map((s) => ({
      id: s.id,
      sessionDate: s.sessionDate,
      topic: s.topic,
      anzahlUe: s.anzahlUe,
      modus: s.modus,
      isErstgespraech: s.isErstgespraech,
      hasParticipantSignature: signedSessionIds.has(s.id),
      status: s.status,
    })),
    documents: docRows.map((d) => ({
      id: d.id,
      type: d.type as DocumentTypeId,
      status: d.status as "active" | "completed",
      hasParticipantSignature: signedDocIds.has(d.id),
    })),
  };
}
