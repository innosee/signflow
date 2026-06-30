import Link from "next/link";

import { getActiveRole, requireSession } from "@/lib/dal";
import { listChangelogEntries } from "@/lib/changelog";
import { formatDateDE } from "@/lib/format-date";

import { MarkChangelogSeen } from "./mark-seen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Neu bei Signflow",
};

export default async function NeuPage() {
  const session = await requireSession();
  const backHref =
    getActiveRole(session) === "bildungstraeger" ? "/bildungstraeger" : "/coach";

  const entries = await listChangelogEntries();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link
          href={backHref}
          className="text-sm text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← Zurück
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Neu bei Signflow
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Was wir zuletzt verbessert haben.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          Noch keine Neuigkeiten. Schau bald wieder vorbei.
        </p>
      ) : (
        <ol className="space-y-6">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-zinc-300 bg-white p-6"
            >
              <time className="text-xs font-medium uppercase tracking-wide text-sky-700">
                {formatDateDE(e.publishedAt)}
              </time>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                {e.title}
              </h2>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                {e.body}
              </div>
            </li>
          ))}
        </ol>
      )}

      <MarkChangelogSeen />
    </div>
  );
}
