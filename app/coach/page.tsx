import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  getSigningEnabled,
  getTenantId,
  isImpersonating,
  requireCoach,
} from "@/lib/dal";
import { courseVisibleToCoach } from "@/lib/course-access";

import { CoachCourseList } from "./course-list";

export const dynamic = "force-dynamic";

export default async function CoachDashboard() {
  const session = await requireCoach();
  const impersonating = isImpersonating(session);

  // Coaches ohne Signatur-Flag landen beim Einloggen direkt im Checker.
  // Kein „leeres Kurse-Dashboard" zeigen — das würde verwirren und legt
  // UI-Pfade frei, die nicht funktionieren.
  const signingEnabled = await getSigningEnabled(session.user.id);
  if (!signingEnabled) redirect("/coach/checker");

  const [me] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  const hasSignature = !!me?.signatureUrl;

  // Kompetenzteams: Coach sieht eine Maßnahme, wenn er Lead ODER mind. einem
  // Termin zugewiesen ist. Zusätzlich tenant-gescoped (Defense-in-Depth über
  // die Teilnehmer-Tenant-Spalte — Kurse selbst tragen keine tenant_id).
  const tenantId = getTenantId(session);
  const courses = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      customerName: schema.participants.name,
      avgsNummer: schema.courses.avgsNummer,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      status: schema.courses.status,
      reviewStatus: schema.courses.reviewStatus,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.participants.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
        courseVisibleToCoach(session.user.id),
      ),
    )
    .orderBy(desc(schema.courses.createdAt));

  // In-App-Benachrichtigung: Kurse, bei denen der Bildungsträger eine
  // Nachbesserung angefordert hat → der Coach ist am Zug.
  const nachbesserung = courses.filter(
    (c) => c.reviewStatus === "changes_requested",
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Coach Dashboard
        </h1>
      </header>

      {nachbesserung.length > 0 && !impersonating && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">
            {nachbesserung.length === 1
              ? "Eine Anwesenheitsliste braucht deine Nachbesserung."
              : `${nachbesserung.length} Anwesenheitslisten brauchen deine Nachbesserung.`}
          </p>
          <p className="mt-1">
            Der Bildungsträger hat eine Rückmeldung hinterlassen. Öffne den
            Kunden, lies den Verlauf und antworte oder bessere nach.
          </p>
          <ul className="mt-2 space-y-1">
            {nachbesserung.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/coach/courses/${c.id}`}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                >
                  {c.customerName} — {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasSignature && !impersonating && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Unterschrift noch nicht hinterlegt.</p>
          <p className="mt-1">
            Du brauchst eine einmalig erfasste Unterschrift, bevor du Termine
            bestätigen kannst.
          </p>
          <Link
            href="/coach/signature"
            className="mt-3 inline-block rounded-lg bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800"
          >
            Jetzt anlegen
          </Link>
        </div>
      )}

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Meine Kunden ({courses.length})
          </h2>
          {/* 1:1: Coaches legen nicht mehr selbst an — der Bildungsträger
              erstellt Kunden und weist sie zu. */}
        </div>

        <CoachCourseList courses={courses} />
      </section>
    </div>
  );
}
