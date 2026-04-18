"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireCoach } from "@/lib/dal";

export type CourseFormState =
  | { error?: string; info?: string }
  | undefined;

type ParticipantInput = {
  name: string;
  email: string;
  kundenNr: string;
};

function parseParticipants(formData: FormData): ParticipantInput[] {
  // Client sendet parallele Arrays: participants[<i>][name|email|kunden_nr].
  // Wir akzeptieren Namen in der Form `p_name_0`, `p_email_0`, `p_kundennr_0`.
  const names = formData.getAll("p_name").map(String);
  const emails = formData.getAll("p_email").map(String);
  const kundenNrs = formData.getAll("p_kundennr").map(String);

  const len = Math.max(names.length, emails.length, kundenNrs.length);
  const out: ParticipantInput[] = [];
  for (let i = 0; i < len; i++) {
    const name = (names[i] ?? "").trim();
    const email = (emails[i] ?? "").trim().toLowerCase();
    const kundenNr = (kundenNrs[i] ?? "").trim();
    // Leere Zeilen überspringen (entstehen, wenn der Coach eine Zeile anlegt
    // und dann nicht füllt).
    if (!name && !email && !kundenNr) continue;
    out.push({ name, email, kundenNr });
  }
  return out;
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function createCourse(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const session = await requireCoach();
  assertNotImpersonating(session);
  const coachId = session.user.id;

  const title = String(formData.get("title") ?? "").trim();
  const avgsNummer = String(formData.get("avgsNummer") ?? "").trim();
  const durchfuehrungsort = String(
    formData.get("durchfuehrungsort") ?? "",
  ).trim();
  const anzahlBewilligteUeRaw = String(
    formData.get("anzahlBewilligteUe") ?? "",
  ).trim();
  const bedarfstraeger = String(formData.get("bedarfstraeger") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  if (
    !title ||
    !avgsNummer ||
    !durchfuehrungsort ||
    !anzahlBewilligteUeRaw ||
    !bedarfstraeger ||
    !startDate ||
    !endDate
  ) {
    return { error: "Bitte alle Kurs-Felder ausfüllen." };
  }

  const anzahlBewilligteUe = Number.parseInt(anzahlBewilligteUeRaw, 10);
  if (!Number.isInteger(anzahlBewilligteUe) || anzahlBewilligteUe <= 0) {
    return { error: "Bewilligte UE muss eine positive ganze Zahl sein." };
  }

  if (bedarfstraeger !== "JC" && bedarfstraeger !== "AA") {
    return { error: "Bedarfsträger muss JC oder AA sein." };
  }

  if (endDate < startDate) {
    return { error: "Enddatum darf nicht vor dem Startdatum liegen." };
  }

  const participants = parseParticipants(formData);
  if (participants.length === 0) {
    return { error: "Bitte mindestens einen Teilnehmer erfassen." };
  }
  for (const p of participants) {
    if (!p.name || !p.email || !p.kundenNr) {
      return {
        error:
          "Jeder Teilnehmer braucht Name, E-Mail und Kunden-Nr. (AfA). Leere Zeilen bitte entfernen.",
      };
    }
    if (!looksLikeEmail(p.email)) {
      return { error: `Ungültige E-Mail-Adresse: ${p.email}` };
    }
  }
  // Duplikate in derselben Teilnehmer-Liste ausfiltern (wäre UNIQUE-Violation
  // auf course_participants + verwirrt den Coach).
  const seen = new Set<string>();
  for (const p of participants) {
    if (seen.has(p.email)) {
      return { error: `E-Mail doppelt in der Liste: ${p.email}` };
    }
    seen.add(p.email);
  }

  const reusedNames: string[] = [];
  let newCourseId: string | null = null;

  try {
    newCourseId = await db.transaction(async (tx) => {
      const [course] = await tx
        .insert(schema.courses)
        .values({
          coachId,
          title,
          avgsNummer,
          durchfuehrungsort,
          anzahlBewilligteUe,
          bedarfstraeger,
          startDate,
          endDate,
        })
        .returning({ id: schema.courses.id });
      if (!course) throw new Error("COURSE_INSERT_FAILED");

      for (const p of participants) {
        const [existing] = await tx
          .select({
            id: schema.participants.id,
            name: schema.participants.name,
            kundenNr: schema.participants.kundenNr,
          })
          .from(schema.participants)
          .where(eq(schema.participants.email, p.email))
          .limit(1);

        let participantId: string;
        if (existing) {
          participantId = existing.id;
          // Wenn der Coach abweichende Daten eingibt, notieren wir das in
          // einer Info-Message — die bestehende Zeile bleibt unverändert,
          // weil participants global-unique per Email ist und andere Kurse
          // dieselben Werte verwenden könnten.
          if (
            existing.name !== p.name ||
            existing.kundenNr !== p.kundenNr
          ) {
            reusedNames.push(p.email);
          }
        } else {
          const [created] = await tx
            .insert(schema.participants)
            .values({ name: p.name, email: p.email, kundenNr: p.kundenNr })
            .returning({ id: schema.participants.id });
          if (!created) throw new Error("PARTICIPANT_INSERT_FAILED");
          participantId = created.id;
        }

        await tx.insert(schema.courseParticipants).values({
          courseId: course.id,
          participantId,
        });
      }

      return course.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Kurs konnte nicht angelegt werden (${message}).` };
  }

  if (!newCourseId) {
    return { error: "Kurs konnte nicht angelegt werden." };
  }

  // Hinweis-Payload via Query-String, weil wir danach redirecten und kein
  // Action-State mitnehmen können.
  const info =
    reusedNames.length > 0 ? `reused=${reusedNames.length}` : undefined;
  redirect(`/coach/courses/${newCourseId}${info ? `?${info}` : ""}`);
}
