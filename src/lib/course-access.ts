import "server-only";

import { and, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/db";

/**
 * Kompetenzteam — zentrale Sichtbarkeits-/Zugriffs-Logik für Coaches.
 *
 * Ein Coach „gehört" zu einer Maßnahme, wenn er im **Kompetenzteam** des Kunden
 * ist (`course_coaches`). Der Bildungsträger stellt dieses Team zusammen. Alle
 * Coach-seitigen Kurs-Queries müssen über diese Bedingung gehen — nie auf die
 * UI verlassen (Data-Isolation, CLAUDE.md). Jeder Team-Coach darf die
 * Maßnahme sehen und alle Schritte auslösen; signieren kann er nur die Termine,
 * die ihm selbst gehören (`sessions.coach_id`).
 *
 * `courseVisibleToCoach` liefert eine korrelierte SQL-Bedingung für Queries auf
 * `schema.courses`. Der `courses.coach_id`-Zweig (primärer/anlegender Coach) ist
 * zusätzlich enthalten — der ist beim Anlegen ohnehin Team-Mitglied, der OR ist
 * nur Sicherheitsnetz gegen unvollständig gebackfillte Altdaten.
 */
export function courseVisibleToCoach(coachId: string): SQL | undefined {
  return or(
    eq(schema.courses.coachId, coachId),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.courseCoaches)
        .where(
          and(
            eq(schema.courseCoaches.courseId, schema.courses.id),
            eq(schema.courseCoaches.coachId, coachId),
          ),
        ),
    ),
  );
}

/**
 * Darf dieser Coach die Maßnahme sehen/öffnen UND ihre Schritte auslösen?
 * (= Mitglied des Kompetenzteams.) Nicht-gelöschte Kurse. Server-Gate für die
 * Detail-Seite und alle schreibenden Coach-Aktionen.
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
