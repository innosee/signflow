import "server-only";

import { and, eq, isNull, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { geleisteteUeForCourse } from "@/lib/course-ue";
import {
  isMassnahmeTyp,
  MASSNAHME_TYP_LABEL,
} from "@/lib/massnahme-typ";
import { resolveAssetUrl } from "@/lib/storage";
import type { DocumentSheetData } from "@/components/documents/types";
import type { DocumentTypeId } from "@/lib/documents/config";

/**
 * Lädt alle Daten, die eine Dokument-Vorlage (Screen + Print/PDF) braucht.
 *
 * Wie `loadStundennachweisSheet` **nicht** coach-/tenant-gescoped — der Zugriff
 * wird vom Aufrufer gesichert (Coach-Route via `courseVisibleToCoach`, Print/
 * PDF-Route ebenso, Teilnehmer via Magic-Link-Token). Gibt `null` für ein
 * nicht existierendes/soft-gelöschtes Dokument zurück.
 */
export async function loadDocumentSheet(
  documentId: string,
): Promise<DocumentSheetData | null> {
  const [doc] = await db
    .select({
      id: schema.documents.id,
      type: schema.documents.type,
      status: schema.documents.status,
      formData: schema.documents.formData,
      courseId: schema.documents.courseId,
      participantId: schema.documents.participantId,
      // Kurs
      courseTitle: schema.courses.title,
      massnahmeTyp: schema.courses.massnahmeTyp,
      signatureMode: schema.courses.signatureMode,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      avgsNummer: schema.courses.avgsNummer,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      tenantId: schema.participants.tenantId,
      orgSignatureUrl: schema.tenants.signatureUrl,
      // Teilnehmer (Stammdaten)
      pName: schema.participants.name,
      pVorname: schema.participants.vorname,
      pNachname: schema.participants.nachname,
      pStrasse: schema.participants.strasse,
      pPlz: schema.participants.plz,
      pOrt: schema.participants.ort,
      pGeburtsdatum: schema.participants.geburtsdatum,
      pGeburtsort: schema.participants.geburtsort,
      pPhone: schema.participants.phone,
      pFestnetz: schema.participants.festnetz,
      pEmail: schema.participants.email,
      pKundenNr: schema.participants.kundenNr,
      // Lead-Coach (Fallback-Name, falls noch keine Coach-Signatur da ist)
      leadCoachName: schema.users.name,
    })
    .from(schema.documents)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.documents.courseId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.documents.participantId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .leftJoin(schema.tenants, eq(schema.tenants.id, schema.participants.tenantId))
    .where(
      and(
        eq(schema.documents.id, documentId),
        isNull(schema.documents.deletedAt),
      ),
    )
    .limit(1);

  if (!doc) return null;

  // Signaturen (max. eine Coach- + eine Teilnehmer-Zeile) inkl. Coach-Name.
  const sigRows = await db
    .select({
      signerType: schema.documentSignatures.signerType,
      signatureUrl: schema.documentSignatures.signatureUrl,
      signedAt: schema.documentSignatures.signedAt,
      coachName: schema.users.name,
    })
    .from(schema.documentSignatures)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.documentSignatures.coachId),
    )
    .where(eq(schema.documentSignatures.documentId, documentId));

  const coachSig = sigRows.find((r) => r.signerType === "coach") ?? null;
  const participantSig =
    sigRows.find((r) => r.signerType === "participant") ?? null;

  // Letzter tatsächlicher Termin (max. session_date, nicht gelöscht) — bildet auf
  // der Teilnahmebescheinigung das Zeitraum-Ende (statt des Bewilligungsendes).
  const [{ letzterTermin } = { letzterTermin: null }] = await db
    .select({ letzterTermin: max(schema.sessions.sessionDate) })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, doc.courseId),
        isNull(schema.sessions.deletedAt),
      ),
    );

  // Geleistete UE (= Summe der vollständig signierten Termine) für die
  // Teilnahmebescheinigung — dort steht die erbrachte, nicht die bewilligte
  // Stundenzahl.
  const geleisteteUe = await geleisteteUeForCourse(doc.courseId);

  const branding = await getBranding(doc.tenantId);
  const [brandingLogo, coachSigUrl, participantSigUrl, orgSigUrl] =
    await Promise.all([
      resolveAssetUrl(branding.logoUrl),
      resolveAssetUrl(coachSig?.signatureUrl),
      resolveAssetUrl(participantSig?.signatureUrl),
      resolveAssetUrl(doc.orgSignatureUrl),
    ]);

  const massnahmeLabel = isMassnahmeTyp(doc.massnahmeTyp)
    ? MASSNAHME_TYP_LABEL[doc.massnahmeTyp]
    : doc.courseTitle;

  // Analog-Modus (Kurs `signature_mode = 'analog'`): das Dokument wird auf Papier
  // unterschrieben. ALLE Unterschriften (Org/Coach + Teilnehmer) bleiben im PDF
  // leer — `SignatureLine`/der TNB-Block zeichnen dann bereits eine leere Box mit
  // „Ort, Datum / Unterschrift"-Caption. Die eigentliche Beweiskraft trägt der
  // separat hochgeladene, unterschriebene Scan (documents.analog_scan_url).
  const analog = doc.signatureMode === "analog";

  // Legal-Integrität: ab Coach-Signatur (`status !== 'draft'`) liegen die
  // Teilnehmer-Stammdaten als Snapshot (`tn_*`) in `form_data` — ein danach
  // geänderter Teilnehmer-Datensatz darf das signierte Dokument NICHT mehr
  // verändern. Im Draft (noch keine Snapshot-Keys) zeigen wir die Live-Werte,
  // damit die Vorschau den aktuellen Stand spiegelt.
  const snap = (doc.formData ?? {}) as Record<string, string>;
  const frozen = doc.status !== "draft";
  const pick = (key: string, live: string | null): string | null =>
    frozen && snap[key] != null ? snap[key] : live;

  return {
    documentId: doc.id,
    type: doc.type as DocumentTypeId,
    status: doc.status,
    formData: snap,
    branding: { logoUrl: brandingLogo },
    analog,
    orgSignatureUrl: analog ? null : orgSigUrl,
    participant: {
      name: pick("tn_name", doc.pName) ?? doc.pName,
      vorname: pick("tn_vorname", doc.pVorname),
      nachname: pick("tn_nachname", doc.pNachname),
      strasse: pick("tn_strasse", doc.pStrasse),
      plz: pick("tn_plz", doc.pPlz),
      ort: pick("tn_ort", doc.pOrt),
      geburtsdatum: pick("tn_geburtsdatum", doc.pGeburtsdatum),
      geburtsort: pick("tn_geburtsort", doc.pGeburtsort),
      phone: pick("tn_phone", doc.pPhone),
      festnetz: pick("tn_festnetz", doc.pFestnetz),
      email: pick("tn_email", doc.pEmail) ?? doc.pEmail,
      kundenNr: doc.pKundenNr,
    },
    course: {
      title: doc.courseTitle,
      massnahmeTyp: doc.massnahmeTyp,
      massnahmeLabel,
      durchfuehrungsort: doc.durchfuehrungsort,
      avgsNummer: doc.avgsNummer,
      anzahlBewilligteUe: doc.anzahlBewilligteUe,
      geleisteteUe,
      startDate: doc.startDate,
      endDate: doc.endDate,
      letzterTermin: letzterTermin ?? null,
    },
    coachName: coachSig?.coachName ?? doc.leadCoachName,
    signatures: {
      coach:
        analog || !coachSig
          ? null
          : { url: coachSigUrl, signedAt: coachSig.signedAt.toISOString() },
      participant:
        analog || !participantSig
          ? null
          : {
              url: participantSigUrl,
              signedAt: participantSig.signedAt.toISOString(),
            },
    },
  };
}
