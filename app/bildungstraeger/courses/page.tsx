import Link from "next/link";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  ANW_STATUS_LABEL,
  ANW_STATUS_TONE,
  anwStatus,
} from "@/lib/anw-status";
import {
  AVGS_STAGE_BADGE,
  AVGS_STAGE_LABEL,
  avgsStage,
} from "@/lib/avgs-stage";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";

import { archiveAllCompleted } from "./actions";
import {
  KundenCockpitList,
  type CockpitRow,
} from "./kunden-cockpit-list";
import { TrackCoursePublished } from "./track-course-published";

export const dynamic = "force-dynamic";

export default async function BildungstraegerCoursesPage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  // Zentrales Kunden-Cockpit: pro Kunde alles, was den Versand-Stand ans
  // Jobcenter/die AfA bestimmt — die drei FES-Gates + Siegel-/AfA-Stand
  // (final_documents) und der Abschlussbericht (abschlussberichte, 1:1 über
  // participant_id). Beide per leftJoin, weil sie erst spät im Flow entstehen.
  const customers = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      status: schema.courses.status,
      abgeschlossenAt: schema.courses.abgeschlossenAt,
      anwCheckPassedAt: schema.courses.anwCheckPassedAt,
      reviewStatus: schema.courses.reviewStatus,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      bewilligtAt: schema.courses.bewilligtAt,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
      coachName: schema.users.name,
      bedarfstraegerName: schema.bedarfstraeger.name,
      fesStatus: schema.finalDocuments.fesStatus,
      afaStatus: schema.finalDocuments.afaStatus,
      berId: schema.abschlussberichte.id,
      berStatus: schema.abschlussberichte.status,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .leftJoin(
      schema.finalDocuments,
      eq(schema.finalDocuments.courseId, schema.courses.id),
    )
    .leftJoin(
      schema.abschlussberichte,
      and(
        eq(schema.abschlussberichte.courseId, schema.courses.id),
        eq(schema.abschlussberichte.participantId, schema.courses.participantId),
      ),
    )
    .where(
      and(
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
        // Archivierte Kunden leben jetzt auf /bildungstraeger/archive.
        ne(schema.courses.status, "archived"),
      ),
    )
    .orderBy(desc(schema.courses.createdAt));

  // Kunde-Dokumente (DS/TNV/STV) pro Kunde für das Cockpit-Badge — nur der
  // Vollständigkeits-Stand („completed" = beidseitig signiert). EINE Query für
  // alle Kunden statt N+1. Ein completed TNV+DS-Merge deckt DS UND TNV ab.
  const courseIds = customers.map((c) => c.id);
  const docRows = courseIds.length
    ? await db
        .select({
          courseId: schema.documents.courseId,
          type: schema.documents.type,
          status: schema.documents.status,
        })
        .from(schema.documents)
        .where(
          and(
            inArray(schema.documents.courseId, courseIds),
            isNull(schema.documents.deletedAt),
          ),
        )
    : [];
  const completedTypesByCourse = new Map<string, Set<string>>();
  const hasDocsByCourse = new Set<string>();
  for (const d of docRows) {
    hasDocsByCourse.add(d.courseId);
    if (d.status === "completed") {
      const set = completedTypesByCourse.get(d.courseId) ?? new Set<string>();
      set.add(d.type);
      completedTypesByCourse.set(d.courseId, set);
    }
  }

  // „Abgeschlossen" = Maßnahme als abgeschlossen markiert (abgeschlossen_at).
  const archivableCount = customers.filter(
    (c) => c.abgeschlossenAt && c.status !== "archived",
  ).length;

  const rows: CockpitRow[] = customers.map((c) => {
    const isArchived = c.status === "archived";
    const stage = avgsStage({ startDate: c.startDate, bewilligtAt: c.bewilligtAt });
    const anw = anwStatus({
      abgeschlossenAt: c.abgeschlossenAt,
      anwCheckPassedAt: c.anwCheckPassedAt,
      reviewStatus: c.reviewStatus,
      fesStatus: c.fesStatus,
    });
    const sealed = c.fesStatus === "completed";
    // Doc-Badge nur zeigen, wenn der Kunde überhaupt Dokumente hat (sonst
    // bleibt die Zeile für Kunden ohne Dokumente-Nutzung sauber). Ein
    // completed Merge (tnv_ds_merge) deckt DS UND TNV ab.
    const completed = completedTypesByCourse.get(c.id) ?? new Set<string>();
    const mergeDone = completed.has("tnv_ds_merge");
    const docChips = hasDocsByCourse.has(c.id)
      ? [
          { label: "DS", done: completed.has("f04_ds") || mergeDone },
          { label: "TNV", done: completed.has("f08_tnv") || mergeDone },
          { label: "STV", done: completed.has("f21_stv") },
        ]
      : null;
    return {
      id: c.id,
      docChips,
      participantName: c.participantName,
      title: c.title,
      kundenNr: c.kundenNr,
      coachName: c.coachName,
      bedarfstraegerName: c.bedarfstraegerName,
      status: c.status,
      statusLabel: isArchived
        ? "Archiviert"
        : c.abgeschlossenAt
          ? "Abgeschlossen"
          : "Aktiv",
      isArchived,
      bewilligt: Boolean(c.bewilligtAt),
      avgsStageLabel: isArchived ? null : AVGS_STAGE_LABEL[stage],
      avgsStageBadge: isArchived ? null : AVGS_STAGE_BADGE[stage],
      anwLabel: ANW_STATUS_LABEL[anw],
      anwTone: ANW_STATUS_TONE[anw],
      // Download IMMER anbieten (BT-eigener Endpoint) — der BT darf die ANW
      // auch vor der Freigabe als PDF prüfen. `anwSealed` steuert nur den
      // „(Entwurf)"-Hinweis, kein Gate mehr.
      anwPdfUrl: `/api/bildungstraeger/courses/${c.id}/anw-pdf`,
      anwSealed: sealed,
      afaSubmitted: c.afaStatus === "submitted",
      berStatus:
        c.berStatus === "submitted"
          ? "submitted"
          : c.berStatus === "draft"
            ? "draft"
            : "missing",
      berId: c.berId,
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Kunden ({customers.length})
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Zentrale Übersicht aller Maßnahmen-Kunden — Stand von
            Anwesenheitsliste (ANW) und Abschlussbericht (BER), PDF-Downloads
            für den Versand ans Jobcenter/die AfA sowie Verwaltung (Bearbeiten,
            Archivieren, Löschen).
          </p>
        </header>
        <div className="flex shrink-0 items-center gap-2">
          {archivableCount > 0 && (
            <form action={archiveAllCompleted}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-400 px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Alle abgeschlossenen archivieren ({archivableCount})
              </button>
            </form>
          )}
          <Link
            href="/bildungstraeger/courses/new"
            data-track="course_create_started"
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            + Neuer Kunde
          </Link>
        </div>
      </div>

      <KundenCockpitList rows={rows} />
      <TrackCoursePublished />
    </div>
  );
}
