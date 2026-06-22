import "server-only";

import { and, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/db";

/**
 * Kompetenzteams — zentrale Sichtbarkeits-/Zugriffs-Logik für Coaches.
 *
 * Ein Coach „gehört" zu einer Maßnahme, wenn er entweder der **Lead-Coach**
 * (`courses.coach_id`) ist ODER ihm **mindestens ein (nicht gelöschter) Termin**
 * zugewiesen ist (`sessions.coach_id`). Alle Coach-seitigen Kurs-Queries müssen
 * über diese Bedingung gehen — nie auf die UI verlassen (Data-Isolation,
 * CLAUDE.md).
 *
 * `courseVisibleToCoach` liefert eine korrelierte SQL-Bedingung, die in jeder
 * Query auf `schema.courses` verwendet werden kann (sie referenziert
 * `schema.courses.id`). Der Lead-Zweig steht zuerst (häufigster Fall).
 */
export function courseVisibleToCoach(coachId: string): SQL | undefined {
  return or(
    eq(schema.courses.coachId, coachId),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.courseId, schema.courses.id),
            eq(schema.sessions.coachId, coachId),
            isNull(schema.sessions.deletedAt),
          ),
        ),
    ),
  );
}

/**
 * Darf dieser Coach die Maßnahme sehen/öffnen? (Lead ODER ≥1 zugewiesener
 * Termin.) Nicht-gelöschte Kurse. Server-Gate für die Detail-Seite und
 * read-only Coach-Aktionen, analog zu `requireOwnedCourseId` (lead-only) für
 * schreibende Lead-Aktionen.
 */
export async function coachCanAccessCourse(
  courseId: string,
  coachId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(coachId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Ist dieser Coach der Lead (steuert Gates/Abschluss/FES)? */
export async function isCourseLead(
  courseId: string,
  coachId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, coachId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  return !!row;
}
