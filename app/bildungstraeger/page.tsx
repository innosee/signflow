import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  getTenantId,
  isTenantOwner,
  requireBildungstraeger,
} from "@/lib/dal";

import { CoachSearchList } from "./coach-search-list";
import { InviteCoachForm } from "./invite-form";

export const dynamic = "force-dynamic";

const IMP_ERRORS: Record<string, string> = {
  invalid: "Ungültiger Coach.",
  unknown: "Dieser Coach existiert nicht (mehr).",
  banned: "Coach ist gesperrt — Impersonation nicht möglich.",
  api: "Impersonation von Better Auth abgelehnt.",
  has_courses:
    "Coach hat noch nicht-archivierte Kurse — diese zuerst abschließen oder archivieren.",
  delete_failed: "Coach konnte nicht gelöscht werden.",
  not_owner:
    "Impersonation ist dem Owner-Account vorbehalten — bitte den Owner deines Tenants bitten zu übernehmen.",
};

type Props = {
  searchParams: Promise<{ imp_error?: string }>;
};

export default async function BildungstraegerDashboard({ searchParams }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const isOwner = await isTenantOwner(session);
  const { imp_error } = await searchParams;
  const impErrorMsg = imp_error ? IMP_ERRORS[imp_error] : undefined;

  // Offene AfA-Übermittlungen (gesiegelt, aber noch nicht an die AfA raus)
  // — als Teaser oben in der Übersicht anzeigen, damit der Firmen-User
  // direkt sieht, dass Arbeit im Stapel liegt. Tenant-Filter via Coach-Join,
  // weil final_documents nicht direkt tenant-scoped ist (kommt indirekt über
  // den Kurs-Coach).
  const [pendingSubmissionsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.finalDocuments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.finalDocuments.courseId))
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.finalDocuments.fesStatus, "completed"),
        eq(schema.finalDocuments.afaStatus, "pending"),
        eq(schema.users.tenantId, tenantId),
      ),
    );
  const pendingSubmissions = pendingSubmissionsRow?.count ?? 0;

  // Offene Anwesenheitslisten-Prüfungen (Coach hat eingereicht, BT muss
  // entscheiden) — blockieren die FES-Versiegelung beim Coach, deshalb als
  // eigener Teaser oben. Tenant-Filter via Coach-Join.
  const [pendingReviewsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.reviewStatus, "pending"),
        eq(schema.users.tenantId, tenantId),
      ),
    );
  const pendingReviews = pendingReviewsRow?.count ?? 0;

  const coaches = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      banned: schema.users.banned,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "coach"),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.users.deletedAt),
      ),
    )
    .orderBy(desc(schema.users.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bildungsträger Dashboard
        </h1>
      </header>

      {impErrorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {impErrorMsg}
        </div>
      )}

      <section className="rounded-xl border border-zinc-900 bg-zinc-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Eingereichte Abschlussberichte</h2>
            <p className="mt-1 text-sm text-zinc-300">
              Flache Liste aller von Coaches an dich übergebenen Berichte —
              mit Suche und PDF-Download. Kurs-gebunden und Schnell-Check
              zusammen.
            </p>
          </div>
          <Link
            href="/bildungstraeger/abschlussberichte"
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
          >
            Liste öffnen →
          </Link>
        </div>
      </section>

      <section
        className={`rounded-xl border p-6 ${
          pendingReviews > 0
            ? "border-amber-300 bg-amber-50"
            : "border-zinc-300 bg-white"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Anwesenheitslisten prüfen
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {pendingReviews === 0
                ? "Aktuell keine Liste zur Prüfung."
                : `${pendingReviews} ${
                    pendingReviews === 1
                      ? "Liste wartet"
                      : "Listen warten"
                  } auf deine Freigabe (blockiert die FES-Versiegelung).`}
            </p>
          </div>
          <Link
            href="/bildungstraeger/reviews"
            className="shrink-0 rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-white/60"
          >
            Öffnen
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">AfA-Übermittlungen</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {pendingSubmissions === 0
                ? "Aktuell kein Kurs zur Übermittlung bereit."
                : `${pendingSubmissions} abgeschlossener ${
                    pendingSubmissions === 1 ? "Kurs wartet" : "Kurse warten"
                  } auf Übermittlung.`}
            </p>
          </div>
          <Link
            href="/bildungstraeger/submissions"
            className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Öffnen
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Kunden</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Zentrale Übersicht pro Kunde: Stand von Anwesenheitsliste und
              Abschlussbericht, PDF-Downloads für den Versand sowie Verwalten,
              Archivieren und Löschen.
            </p>
          </div>
          <Link
            href="/bildungstraeger/courses"
            className="shrink-0 rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Öffnen
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <h2 className="text-lg font-semibold">Coach einladen</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Der Coach erhält eine E-Mail mit Link zum Passwort-Setzen.
        </p>
        <div className="mt-4">
          <InviteCoachForm />
        </div>
      </section>

      <CoachSearchList coaches={coaches} canImpersonate={isOwner} />
    </div>
  );
}
