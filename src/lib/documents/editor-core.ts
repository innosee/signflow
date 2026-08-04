import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { sendParticipantInvite } from "@/lib/participant-tokens";
import { uploadSignedScan } from "@/lib/storage";
import {
  getDocumentConfig,
  MASTER_FIELD_LABELS,
  MASTER_FIELD_ORDER,
  missingMasterData,
  missingRequiredFields,
  type DocumentOwner,
  type DocumentTypeId,
} from "@/lib/documents/config";

/**
 * Rollen-übergreifender Kern des Dokument-Editors (Speichern + Freigeben).
 *
 * Coach- und Bildungsträger-Server-Actions unterscheiden sich nur in Auth,
 * Zugriffs-Scope (courseVisibleToCoach vs. tenant) und der Quelle der zweiten
 * („erango-Seite") Signatur — der eigentliche Persist-/Freigabe-/Snapshot-/
 * Audit-Ablauf ist identisch und lebt hier, damit er nicht driftet. Die Routen
 * bleiben dünn: Auth → Dokument scope-sicher laden → `submitDocument` → je nach
 * Ergebnis revalidieren.
 */

export type EditableDocument = {
  id: string;
  courseId: string;
  participantId: string;
  type: DocumentTypeId;
  status: "draft" | "active" | "completed";
  formData: Record<string, unknown> | null;
};

/** Wer handelt. `userId` landet als konkreter Signatur-Actor im Audit/Row. */
export type DocActor = { type: DocumentOwner; userId: string };

export type SubmitOutcome =
  | { status: "saved" }
  | { status: "released" }
  | { status: "error"; message: string; echo: boolean };

const CONTROL_FIELDS = new Set(["documentId", "intent", "confirm"]);

/**
 * Roh-Eingaben für das Werte-Echo bei Fehler — sonst setzt React 19 das
 * Formular auf die alten Werte zurück und getippter Text geht verloren
 * (AGENTS.md / docs/forms-server-actions.md). Bewusst **generisch** (alle
 * String-Felder außer den Steuerfeldern), damit es auch dann greift, wenn der
 * Dokumenttyp noch nicht bekannt ist (z.B. „Dokument nicht gefunden" VOR dem
 * Laden). Deckt Formularfelder (`field.key`) und `m_`-Stammdaten ab.
 */
export function collectAllFormValues(
  formData: FormData,
): Record<string, string> {
  const submitted: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (CONTROL_FIELDS.has(key)) continue;
    if (typeof value === "string") submitted[key] = value;
  }
  return submitted;
}

/**
 * Persistiert Formularfelder (→ documents.form_data) UND die erweiterten
 * Teilnehmer-Stammdaten (→ participants). Nur im Draft. Gibt die frisch
 * gespeicherte `form_data` zurück, damit ein direkt danach laufender
 * Freigabe-Schritt gegen den AKTUELLEN Stand prüft.
 */
async function persistDraft(
  doc: EditableDocument,
  formData: FormData,
): Promise<Record<string, string>> {
  const cfg = getDocumentConfig(doc.type);
  const nextForm: Record<string, string> = {
    ...((doc.formData ?? {}) as Record<string, string>),
  };
  for (const field of cfg.fields) {
    const raw = formData.get(field.key);
    if (raw != null) nextForm[field.key] = String(raw).trim();
  }

  // Stammdaten-Inputs tragen den `m_`-Namensraum, damit ein Formularfeld mit
  // gleichem Schlüssel (z.B. `ort`) sie nicht überschreibt.
  const patch: Record<string, string | null> = {};
  for (const f of MASTER_FIELD_ORDER) {
    const raw = formData.get(`m_${f}`);
    if (raw == null) continue;
    const v = String(raw).trim();
    patch[f] = v === "" ? null : v;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ formData: nextForm })
      .where(eq(schema.documents.id, doc.id));
    if (Object.keys(patch).length > 0) {
      await tx
        .update(schema.participants)
        .set(patch)
        .where(eq(schema.participants.id, doc.participantId));
    }
  });

  return nextForm;
}

/**
 * Ein Editor-Submit. `intent=save` speichert nur (Entwurf). `intent=release`
 * speichert ebenfalls und gibt danach frei: Pflichtprüfung → Snapshot
 * einfrieren → Status `active` + Signatur der erango-Seite (Coach- bzw.
 * Org-Unterschrift). Weil IMMER zuerst persistiert wird, kann die Pflichtprüfung
 * nicht mehr an ungespeicherten Eingaben scheitern.
 *
 * `resolveOrgSignature` liefert lazy die zweite Signatur (nur bei Freigabe
 * ausgewertet): Coach-Unterschrift (`users.signature_url`) bzw. geteilte
 * Org-Unterschrift (`tenants.signature_url`). `null` = keine hinterlegt → harte
 * Hürde. Der `actor.type` muss dem `owner` des Dokumenttyps entsprechen (die
 * jeweils andere Rolle sieht das Dokument nur read-only) — Defense-in-Depth
 * zusätzlich zu den Routen-Vorprüfungen.
 */
export async function submitDocument(params: {
  doc: EditableDocument;
  formData: FormData;
  intent: string;
  actor: DocActor;
  ipAddress: string;
  resolveOrgSignature: () => Promise<string | null>;
}): Promise<SubmitOutcome> {
  const { doc, formData, intent, actor, ipAddress } = params;
  const cfg = getDocumentConfig(doc.type);

  // Analog-Modus (Kurs `signature_mode = 'analog'`): das Dokument wird auf Papier
  // unterschrieben. Die Freigabe friert nur den Inhalt ein (Status `active`,
  // Snapshot) — OHNE digitale Org-/Coach-Signatur und OHNE Teilnehmer-Magic-Link.
  // Die eigentliche Unterschrift kommt später als hochgeladener Scan
  // (`confirmDocumentAnalog` → Status `completed`).
  const [courseMode] = await db
    .select({ signatureMode: schema.courses.signatureMode })
    .from(schema.courses)
    .where(eq(schema.courses.id, doc.courseId))
    .limit(1);
  const analog = courseMode?.signatureMode === "analog";

  if (cfg.owner !== actor.type) {
    return {
      status: "error",
      message: "Für dieses Dokument bist du nicht berechtigt.",
      echo: false,
    };
  }
  if (doc.status !== "draft") {
    return {
      status: "error",
      message: "Dieses Dokument ist bereits freigegeben.",
      echo: false,
    };
  }

  const nextForm = await persistDraft(doc, formData);

  if (intent !== "release") {
    return { status: "saved" };
  }

  // --- Freigabe ---
  if (formData.get("confirm") !== "on") {
    return { status: "error", message: "Bitte aktiv bestätigen.", echo: true };
  }

  // Teilnehmer-Stammdaten (frisch, nach persistDraft) für Pflichtprüfung + Snapshot.
  const [p] = await db
    .select({
      name: schema.participants.name,
      vorname: schema.participants.vorname,
      nachname: schema.participants.nachname,
      strasse: schema.participants.strasse,
      plz: schema.participants.plz,
      ort: schema.participants.ort,
      geburtsdatum: schema.participants.geburtsdatum,
      geburtsort: schema.participants.geburtsort,
      phone: schema.participants.phone,
      festnetz: schema.participants.festnetz,
      email: schema.participants.email,
    })
    .from(schema.participants)
    .where(eq(schema.participants.id, doc.participantId))
    .limit(1);
  if (!p) {
    return { status: "error", message: "Kunde nicht gefunden.", echo: true };
  }

  const missingMaster = missingMasterData(doc.type, p);
  if (missingMaster.length > 0) {
    return {
      status: "error",
      message: `Bitte zuerst die Pflicht-Stammdaten ausfüllen: ${missingMaster
        .map((f) => MASTER_FIELD_LABELS[f])
        .join(", ")}.`,
      echo: true,
    };
  }
  const missingFields = missingRequiredFields(doc.type, nextForm);
  if (missingFields.length > 0) {
    return {
      status: "error",
      message: `Bitte zuerst die Pflichtfelder ausfüllen: ${missingFields
        .map((f) => f.label)
        .join(", ")}.`,
      echo: true,
    };
  }

  // Zweite Signatur (erango-Seite) — nur bei Formularen, die sie vorsehen und
  // NUR im digitalen Modus. Im Analog-Modus wird auch die erango-Seite auf
  // Papier unterschrieben, das Feld bleibt leer.
  let orgSignatureUrl: string | null = null;
  if (cfg.signers.coach && !analog) {
    orgSignatureUrl = await params.resolveOrgSignature();
    if (!orgSignatureUrl) {
      return {
        status: "error",
        message:
          actor.type === "bildungstraeger"
            ? "Es ist noch keine Bildungsträger-Unterschrift hinterlegt. Lege sie unter „Unterschrift“ an, dann kannst du freigeben."
            : "Du hast noch keine Unterschrift hinterlegt. Lege sie unter „Unterschrift“ an.",
        echo: true,
      };
    }
  }

  // Snapshot der Stammdaten in form_data einfrieren (siehe loadDocumentSheet).
  const snapshot: Record<string, string> = {
    ...nextForm,
    tn_name: p.name,
    tn_vorname: p.vorname ?? "",
    tn_nachname: p.nachname ?? "",
    tn_strasse: p.strasse ?? "",
    tn_plz: p.plz ?? "",
    tn_ort: p.ort ?? "",
    tn_geburtsdatum: p.geburtsdatum ?? "",
    tn_geburtsort: p.geburtsort ?? "",
    tn_phone: p.phone ?? "",
    tn_festnetz: p.festnetz ?? "",
    tn_email: p.email,
  };

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, doc.id))
        .limit(1);
      if (!fresh || fresh.status !== "draft") throw new Error("ALREADY_ACTIVE");

      if (orgSignatureUrl) {
        // signer_type='coach' = die erango-Seite (Coach ODER BT). Der konkrete
        // Actor (BT-User bei BT-Docs) steht in coach_id, das Bild ist bei
        // BT-Docs die geteilte Org-Unterschrift.
        await tx.insert(schema.documentSignatures).values({
          documentId: doc.id,
          signerType: "coach",
          coachId: actor.userId,
          signatureUrl: orgSignatureUrl,
          ipAddress,
        });
      }

      await tx
        .update(schema.documents)
        .set({ status: "active", formData: snapshot })
        .where(eq(schema.documents.id, doc.id));

      await logAudit(
        {
          actorType: actor.type,
          actorId: actor.userId,
          action: orgSignatureUrl
            ? "document.coach_signed"
            : "document.released",
          resourceType: "document",
          resourceId: doc.id,
          metadata: { type: doc.type, owner: cfg.owner },
          ipAddress,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "ALREADY_ACTIVE") {
      return {
        status: "error",
        message: "Dieses Dokument wurde bereits freigegeben.",
        echo: false,
      };
    }
    console.error("submitDocument(release) failed:", err);
    return {
      status: "error",
      message: "Freigabe fehlgeschlagen. Bitte erneut versuchen.",
      echo: true,
    };
  }

  // Freigabe = Kunde soll unterschreiben → Magic-Link IMMER verschicken
  // (best-effort; ein Mailfehler kippt die erfolgreiche Freigabe NICHT). Bewusst
  // KEIN Dedup: der BT/Coach erwartet, dass „freigeben" den Kunden benachrichtigt
  // — ein stilles Überspringen (weil noch ein Link gültig ist) verwirrt und lässt
  // den UI-Hinweis „wurde benachrichtigt" lügen. Typisch sind eh nur 1–2
  // Dokumente pro Kunde, also kein Spam.
  // Analog-Modus: KEIN Magic-Link — der Kunde unterschreibt auf Papier.
  if (!analog) {
    try {
      await sendParticipantInvite({
        courseId: doc.courseId,
        participantId: doc.participantId,
        channel: "email",
      });
    } catch (err) {
      console.error(
        "submitDocument: automatische Teilnehmer-Benachrichtigung fehlgeschlagen",
        err,
      );
    }
  }

  return { status: "released" };
}

export type ConfirmAnalogResult =
  | { status: "confirmed" }
  | { status: "error"; message: string };

const MAX_SCAN_BYTES = 15_000_000; // 15 MB — reicht für einen mehrseitigen Scan

/**
 * Analog-Modus für Kunde-Dokumente (F08/F21): Der Owner (BT bzw. Coach) lädt den
 * händisch unterschriebenen Formular-Scan (PDF) hoch. Voraussetzung: Der Kurs
 * ist analog UND das Dokument ist freigegeben (`active` = Inhalt eingefroren).
 * Setzt `analog_scan_url`/`analog_confirmed_at` und Status → `completed`; die
 * Dokument-PDF-Endpoints liefern ab dann den Scan statt des Blank-Renders.
 * Owner-agnostischer Kern — die Routen prüfen Auth/Scope vorher.
 */
export async function confirmDocumentAnalog(params: {
  doc: EditableDocument;
  actor: DocActor;
  file: unknown;
  ipAddress: string;
}): Promise<ConfirmAnalogResult> {
  const { doc, actor, file, ipAddress } = params;
  const cfg = getDocumentConfig(doc.type);

  if (cfg.owner !== actor.type) {
    return {
      status: "error",
      message: "Für dieses Dokument bist du nicht berechtigt.",
    };
  }

  const [courseMode] = await db
    .select({ signatureMode: schema.courses.signatureMode })
    .from(schema.courses)
    .where(eq(schema.courses.id, doc.courseId))
    .limit(1);
  if (courseMode?.signatureMode !== "analog") {
    return {
      status: "error",
      message:
        "Diese Maßnahme läuft nicht im Analog-Modus. Der Bildungsträger muss sie zuerst freigeben.",
    };
  }
  if (doc.status !== "active") {
    return {
      status: "error",
      message:
        "Bitte das Dokument zuerst freigeben (Inhalt einfrieren), dann den Scan hochladen.",
    };
  }

  if (!(file instanceof Blob) || file.size === 0) {
    return {
      status: "error",
      message: "Bitte den unterschriebenen Scan als PDF hochladen.",
    };
  }
  if (file.type !== "application/pdf") {
    return { status: "error", message: "Der Scan muss eine PDF-Datei sein." };
  }
  if (file.size > MAX_SCAN_BYTES) {
    return { status: "error", message: "Die PDF ist zu groß (max. 15 MB)." };
  }

  let scanKey: string;
  try {
    scanKey = await uploadSignedScan(`document-${doc.id}`, file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("confirmDocumentAnalog upload failed:", err);
    return { status: "error", message: `Upload fehlgeschlagen (${message}).` };
  }

  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: schema.documents.status })
        .from(schema.documents)
        .where(eq(schema.documents.id, doc.id))
        .limit(1);
      if (!fresh || fresh.status !== "active") throw new Error("NOT_ACTIVE");
      await tx
        .update(schema.documents)
        .set({
          analogScanUrl: scanKey,
          analogConfirmedAt: new Date(),
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(schema.documents.id, doc.id));
      await logAudit(
        {
          actorType: actor.type,
          actorId: actor.userId,
          action: "document.analog_confirmed",
          resourceType: "document",
          resourceId: doc.id,
          metadata: { type: doc.type, owner: cfg.owner },
          ipAddress,
        },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_ACTIVE") {
      return {
        status: "error",
        message: "Dokument ist nicht (mehr) im freigegebenen Zustand.",
      };
    }
    console.error("confirmDocumentAnalog failed:", err);
    return {
      status: "error",
      message: "Bestätigung fehlgeschlagen. Bitte erneut versuchen.",
    };
  }

  return { status: "confirmed" };
}
