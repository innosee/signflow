import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";

/**
 * Tatsächlich **geleistete** UE eines Kurses.
 *
 * Gezählt werden nur Termine mit `status='completed'` (Coach UND Kunde haben
 * signiert) — identisch zur „Geleistete UE"-Kachel auf der Kursseite. Reine
 * Coach-Signaturen oder offene Termine zählen NICHT, sonst würde der Wert
 * gegenüber der AfA optimistisch verfälscht. Erstgespräch und krankheitsbedingt
 * abgesagte Termine tragen per DB-CHECK 0 UE bei, brauchen also keinen Filter.
 *
 * Wichtig für BER und Teilnahmebescheinigung: dort steht die geleistete, nicht
 * die bewilligte Stundenzahl (`courses.anzahl_bewilligte_ue`) — bei vorzeitigem
 * Ende weichen die beiden auseinander (z.B. 17 statt 80 UE).
 */
export async function geleisteteUeForCourse(courseId: string): Promise<number> {
  const [row] = await db
    .select({
      // numeric-Summe kommt als string zurück; `0` deckt „gar keine Termine" ab.
      sum: sql<string>`coalesce(sum(${schema.sessions.anzahlUe}), 0)`,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        isNull(schema.sessions.deletedAt),
        eq(schema.sessions.status, "completed"),
      ),
    );

  const n = Number.parseFloat(row?.sum ?? "0");
  return Number.isFinite(n) ? n : 0;
}
