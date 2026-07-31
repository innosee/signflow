import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import {
  documentConfigsForOwner,
  getDocumentConfig,
  isDocumentOwnedBy,
  type DocumentTypeId,
} from "@/lib/documents/config";
import { isMassnahmeTyp, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";
import { PendingSubmitButton } from "@/components/pending-submit-button";

import { createDocument } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Entwurf", className: "bg-zinc-100 text-zinc-600" },
  active: {
    label: "Wartet auf Teilnehmer:in",
    className: "bg-amber-100 text-amber-800",
  },
  completed: { label: "Abgeschlossen", className: "bg-green-100 text-green-800" },
};

export default async function BildungstraegerDocumentsPage({ params }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId } = await params;

  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      massnahmeTyp: schema.courses.massnahmeTyp,
      pName: schema.participants.name,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        isNull(schema.courses.deletedAt),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!course) notFound();

  const documents = await db
    .select({
      id: schema.documents.id,
      type: schema.documents.type,
      status: schema.documents.status,
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.courseId, courseId),
        isNull(schema.documents.deletedAt),
      ),
    )
    .orderBy(desc(schema.documents.createdAt));

  const massnahmeLabel = isMassnahmeTyp(course.massnahmeTyp)
    ? MASSNAHME_TYP_LABEL[course.massnahmeTyp]
    : course.title;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <Link
          href="/bildungstraeger/courses"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zu Kunden
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dokumente</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {course.pName} · {massnahmeLabel}
        </p>
        <Link
          href={`/bildungstraeger/signature?returnTo=/bildungstraeger/courses/${courseId}/dokumente`}
          className="mt-2 inline-block text-sm text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
        >
          Bildungsträger-Unterschrift verwalten →
        </Link>
      </header>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">Formulare</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Du verwaltest den Teilnehmervertrag & die Teilnahmevereinbarung
            (F08, inkl. Datenschutzhinweise). Die Strategievereinbarung (F21)
            legt der Coach an (für dich nur Ansicht + PDF). Die Teilnehmer:in
            signiert alle über ihren Magic-Link.
          </p>
        </div>

        <div className="divide-y divide-zinc-100">
          {documents.length === 0 ? (
            <p className="px-6 py-4 text-sm text-zinc-500">
              Noch keine Dokumente angelegt.
            </p>
          ) : (
            documents.map((doc) => {
              const cfg = getDocumentConfig(doc.type as DocumentTypeId);
              const badge = STATUS_BADGE[doc.status] ?? STATUS_BADGE.draft;
              const readOnly = !isDocumentOwnedBy(
                doc.type as DocumentTypeId,
                "bildungstraeger",
              );
              return (
                <Link
                  key={doc.id}
                  href={`/bildungstraeger/courses/${courseId}/dokumente/${doc.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 transition hover:bg-zinc-50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    {cfg.formNumber} · {cfg.label}
                    {readOnly && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-500">
                        Coach · nur Ansicht
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </Link>
              );
            })
          )}
        </div>

        <div className="border-t border-zinc-200 px-6 py-4">
          <form
            action={createDocument}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="courseId" value={courseId} />
            <select
              name="type"
              defaultValue="f08_tnv"
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
            >
              {documentConfigsForOwner("bildungstraeger").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.formNumber} · {c.label}
                </option>
              ))}
            </select>
            <PendingSubmitButton
              pendingLabel="Wird angelegt…"
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-zinc-800"
            >
              Dokument hinzufügen
            </PendingSubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
