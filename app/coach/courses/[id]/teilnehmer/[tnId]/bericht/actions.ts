"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { assertNotImpersonating, requireCoach } from "@/lib/dal";

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
  assertNotImpersonating(session);
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

  if (existing) {
    await db
      .update(schema.abschlussberichte)
      .set({ teilnahme, ablauf, fazit })
      .where(eq(schema.abschlussberichte.id, existing.id));
  } else {
    await db.insert(schema.abschlussberichte).values({
      courseId,
      participantId,
      coachId,
      teilnahme,
      ablauf,
      fazit,
    });
  }

  if (wasSubmittedBefore) {
    const { ip, ua } = await currentRequestMeta();
    await logAudit({
      actorType: "coach",
      actorId: coachId,
      action: "ber.edited_after_submit",
      resourceType: "abschlussbericht",
      resourceId: existing.id,
      metadata: { courseId, participantId },
      ipAddress: ip,
      userAgent: ua,
    });
  }

  revalidatePath(`/coach/courses/${courseId}`);
  revalidatePath(`/coach/courses/${courseId}/teilnehmer/${participantId}/bericht`);

  return { savedAt: new Date().toISOString() };
}

/**
 * Finale Einreichung an den Bildungsträger. Setzt Status auf "submitted",
 * setzt `last_check_passed` (vom Client gemeldet — bewusst Trust-the-Client:
 * die Dummy-Validierung läuft ohnehin client-seitig; das echte KI-Gate kommt
 * später serverseitig und ersetzt diesen Pfad).
 */
export async function submitBerAction(
  _prev: BerActionState,
  formData: FormData,
): Promise<BerActionState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  const participantId = String(formData.get("participantId") ?? "").trim();
  const teilnahme = String(formData.get("teilnahme") ?? "");
  const ablauf = String(formData.get("ablauf") ?? "");
  const fazit = String(formData.get("fazit") ?? "");
  const lastCheckPassed = formData.get("lastCheckPassed") === "true";

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
  revalidatePath("/agency");

  return { savedAt: now.toISOString() };
}
