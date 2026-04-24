import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getSigningEnabled, isImpersonating, requireCoach } from "@/lib/dal";

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

  const courses = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      status: schema.courses.status,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
    })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .orderBy(desc(schema.courses.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Coach Dashboard
        </h1>
      </header>

      {!hasSignature && !impersonating && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Unterschrift noch nicht hinterlegt.</p>
          <p className="mt-1">
            Du brauchst eine einmalig erfasste Unterschrift, bevor du Sessions
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
            Meine Kurse ({courses.length})
          </h2>
          {!impersonating && (
            <Link
              href="/coach/courses/new"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Neuer Kurs
            </Link>
          )}
        </div>

        <CoachCourseList courses={courses} />
      </section>
    </div>
  );
}
