"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { isImpersonating, requireCoach } from "@/lib/dal";

export type BerActionState = { error?: string; savedAt?: string } | undefined;

type OwnedContext = {
  courseId: string;
  participantId: string;
  coachId: string;
};

/**
 * Prüft: (1) Kurs gehört Coach, (2) TN ist im Kurs eingeschrieben.
 * Ohne beides darf weder draft noch submit durchgehen.
 */
async function requireOwnedTnContext(
  courseId: string,
  participantId: string,
  coachId: string,
): Promise<OwnedContext | null> {
  const [row] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(
      schema.courseParticipants,
      eq(schema.courseParticipants.courseId, schema.courses.id),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, coachId),
        isNull(schema.courses.deletedAt),
        eq(schema.courseParticipants.participantId, participantId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { courseId, participantId, coachId };
}

async function currentRequestMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent") ?? null;
  return { ip, ua };
}

/**
 * Autosave eines Entwurfs. Upsert-Logik: existiert ein BER für (course, TN),
 * werden Texte aktualisiert; sonst wird ein neuer angelegt. Status wird NICHT
 * automatisch auf "draft" zurückgesetzt — wer nach Einreichung noch editiert,
 * bleibt im Status "submitted" (mit aktualisiertem `updated_at`).
 */
export async function saveBerDraftAction(
  _prev: BerActionState,
  formData: FormData,
): Promise<BerActionState> {
  const session = await requireCoach();
  if (isImpersonating(session)) {
    return { error: "Nur-Lese-Modus: während Impersonation wird nicht gespeichert." };
  }
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const teilnahme = String(formData.get("teilnahme") ?? "");
  const ablauf = String(formData.get("ablauf") ?? "");
  const fazit = String(formData.get("fazit") ?? "");

  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }

  const ctx = await requireOwnedTnContext(courseId, participantId, coachId);
  if (!ctx) return { error: "Kurs/Teilnehmer nicht gefunden." };

  const [existing] = await db
    .select()
    .from(schema.abschlussberichte)
    .where(
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(schema.abschlussberichte.participantId, participantId),
      ),
    )
    .limit(1);

  const wasSubmittedBefore = existing?.status === "submitted";

  let berId: string;
  if (existing) {
    await db
      .update(schema.abschlussberichte)
      .set({ teilnahme, ablauf, fazit })
      .where(eq(schema.abschlussberichte.id, existing.id));
    berId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.abschlussberichte)
      .values({
        courseId,
        participantId,
        coachId,
        teilnahme,
        ablauf,
        fazit,
      })
      .returning({ id: schema.abschlussberichte.id });
    berId = created.id;
  }

  // Audit-Logging:
  // - Erste Draft-Anlage: ein Event (`ber.draft_saved`). Autosaves danach loggen bewusst nicht,
  //   weil sonst bei Debounce von ~1 s der Log mit jedem Tipp-Event überfluten würde.
  // - Edit nach Submit: jede Änderung wird als `ber.edited_after_submit` geloggt, damit die
  //   Nachvollziehbarkeit der Bildungsträger-Sicht sauber bleibt.
  const { ip, ua } = await currentRequestMeta();
  if (wasSubmittedBefore) {
    await logAudit({
      actorType: "coach",
      actorId: coachId,
      action: "ber.edited_after_submit",
      resourceType: "abschlussbericht",
      resourceId: berId,
      metadata: { courseId, participantId },
      ipAddress: ip,
      userAgent: ua,
    });
  } else if (!existing) {
    await logAudit({
      actorType: "coach",
      actorId: coachId,
      action: "ber.draft_saved",
      resourceType: "abschlussbericht",
      resourceId: berId,
      metadata: { courseId, participantId, firstDraft: true },
      ipAddress: ip,
      userAgent: ua,
    });
  }

  revalidatePath(`/coach/courses/${courseId}`);
  revalidatePath(`/coach/courses/${courseId}/teilnehmer/${participantId}/bericht`);

  return { savedAt: new Date().toISOString() };
}

/**
 * Finale Einreichung an den Bildungsträger.
 *
 * ⚠️ TODO (vor Production): `lastCheckPassed` kommt aktuell aus dem FormData
 * — also vom Client. Das ist bewusst so gelöst, weil die Validierung im
 * MVP-Stand client-seitig (Regex-Dummy) läuft und es keine zweite Quelle
 * gäbe, die der Server prüfen könnte. **Sobald das IONOS-/Azure-Wiring
 * steht, muss dieser Pfad auf serverseitige Re-Validierung umgestellt
 * werden** — die Azure-Response ist dann der autoritative Pass/Fail-Wert.
 * Bis dahin bleibt Submit effektiv optional-gesichert; ein bewusst
 * manipulierter Client kann submitten. Im Audit-Log ist das nachvollziehbar.
 */
export async function submitBerAction(
  _prev: BerActionState,
  formData: FormData,
): Promise<BerActionState> {
  const session = await requireCoach();
  if (isImpersonating(session)) {
    return { error: "Nur-Lese-Modus: während Impersonation kannst du nicht einreichen." };
  }
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const teilnahme = String(formData.get("teilnahme") ?? "");
  const ablauf = String(formData.get("ablauf") ?? "");
  const fazit = String(formData.get("fazit") ?? "");
  const lastCheckPassed = formData.get("lastCheckPassed") === "true";
  const checkSnapshotRaw = formData.get("checkSnapshot");
  // Snapshot ist ein String (JSON) vom Client. Wir validieren beim Parse
  // grob auf Objekt-Form — Zod-freie Variante, da das Shape stabil ist
  // und der Client im Zweifel nur sich selbst schadet, nicht dem Server.
  let checkSnapshot: unknown = null;
  if (typeof checkSnapshotRaw === "string" && checkSnapshotRaw.length > 0) {
    try {
      const parsed = JSON.parse(checkSnapshotRaw);
      if (parsed && typeof parsed === "object") {
        checkSnapshot = parsed;
      }
    } catch {
      // Korrupter Snapshot — nicht fatal, wir submitten einfach ohne
    }
  }

  if (!courseId || !participantId) {
    return { error: "Kurs oder Teilnehmer fehlt." };
  }
  if (!lastCheckPassed) {
    return {
      error:
        "Der Bericht hat die finale Prüfung nicht bestanden — bitte erst korrigieren.",
    };
  }
  if (!teilnahme.trim() || !ablauf.trim() || !fazit.trim()) {
    return { error: "Alle drei Abschnitte müssen ausgefüllt sein." };
  }

  const ctx = await requireOwnedTnContext(courseId, participantId, coachId);
  if (!ctx) return { error: "Kurs/Teilnehmer nicht gefunden." };

  const now = new Date();
  const [existing] = await db
    .select({ id: schema.abschlussberichte.id })
    .from(schema.abschlussberichte)
    .where(
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(schema.abschlussberichte.participantId, participantId),
      ),
    )
    .limit(1);

  let berId: string;
  if (existing) {
    await db
      .update(schema.abschlussberichte)
      .set({
        teilnahme,
        ablauf,
        fazit,
        status: "submitted",
        lastCheckPassed: true,
        submittedAt: now,
        checkSnapshot,
        // Re-Submit invalidiert eine frühere Ack — der Bildungsträger
        // soll den neuen Inhalt frisch bewerten.
        softFlagsAcknowledgedAt: null,
        softFlagsAcknowledgedBy: null,
      })
      .where(eq(schema.abschlussberichte.id, existing.id));
    berId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.abschlussberichte)
      .values({
        courseId,
        participantId,
        coachId,
        teilnahme,
        ablauf,
        fazit,
        status: "submitted",
        lastCheckPassed: true,
        submittedAt: now,
        checkSnapshot,
      })
      .returning({ id: schema.abschlussberichte.id });
    berId = created.id;
  }

  const { ip, ua } = await currentRequestMeta();
  await logAudit({
    actorType: "coach",
    actorId: coachId,
    action: "ber.submitted",
    resourceType: "abschlussbericht",
    resourceId: berId,
    metadata: { courseId, participantId },
    ipAddress: ip,
    userAgent: ua,
  });

  revalidatePath(`/coach/courses/${courseId}`);
  revalidatePath(`/coach/courses/${courseId}/teilnehmer/${participantId}/bericht`);
  revalidatePath("/coach/checker");
  revalidatePath("/bildungstraeger");

  return { savedAt: now.toISOString() };
}
