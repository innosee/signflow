import Link from "next/link";

import {
  allDocumentConfigs,
  getDocumentConfig,
  type DocumentTypeId,
} from "@/lib/documents/config";
import { createDocument } from "./dokumente/actions";

export type DocumentListItem = {
  id: string;
  type: DocumentTypeId;
  status: "draft" | "active" | "completed";
  updatedAt: Date;
};

const STATUS_BADGE: Record<
  DocumentListItem["status"],
  { label: string; className: string }
> = {
  draft: { label: "Entwurf", className: "bg-zinc-100 text-zinc-600" },
  active: {
    label: "Wartet auf Teilnehmer:in",
    className: "bg-amber-100 text-amber-800",
  },
  completed: {
    label: "Abgeschlossen",
    className: "bg-green-100 text-green-800",
  },
};

/**
 * Dokumente-Bereich auf der Kursseite: Liste der digitalisierten erango-
 * Formulare für diesen Kunden + Anlegen eines neuen Dokuments. Der Teilnehmer
 * unterschreibt sie über denselben Magic-Link wie die Termine.
 */
export function DocumentsSection({
  courseId,
  documents,
  canManage,
}: {
  courseId: string;
  documents: DocumentListItem[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <div className="border-b border-zinc-300 px-6 py-4">
        <h2 className="text-lg font-semibold">Dokumente</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Digitalisierte erango-Formulare (Datenschutz, Teilnehmervertrag,
          Strategievereinbarung). Du füllst sie aus und unterschreibst; die
          Teilnehmer:in signiert sie über ihren Magic-Link.
        </p>
      </div>

      <div className="divide-y divide-zinc-100">
        {documents.length === 0 ? (
          <p className="px-6 py-4 text-sm text-zinc-500">
            Noch keine Dokumente angelegt.
          </p>
        ) : (
          documents.map((doc) => {
            const cfg = getDocumentConfig(doc.type);
            const badge = STATUS_BADGE[doc.status];
            return (
              <Link
                key={doc.id}
                href={`/coach/courses/${courseId}/dokumente/${doc.id}`}
                className="flex items-center justify-between gap-3 px-6 py-3 transition hover:bg-zinc-50"
              >
                <span className="text-sm font-medium text-zinc-900">
                  {cfg.formNumber} · {cfg.label}
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

      {canManage && (
        <div className="border-t border-zinc-200 px-6 py-4">
          <form action={createDocument} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="courseId" value={courseId} />
            <select
              name="type"
              defaultValue="f08_tnv"
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
            >
              {allDocumentConfigs().map((c) => (
                <option key={c.id} value={c.id}>
                  {c.formNumber} · {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Dokument hinzufügen
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
