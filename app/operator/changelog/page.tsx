import { notFound } from "next/navigation";
import { desc, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

import { ChangelogEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function OperatorChangelogPage() {
  // Gleiches Gate wie /operator/onboard: ohne gesetztes Secret existiert die
  // Seite gar nicht (404). Die eigentliche Auth läuft pro Aktion über das
  // eingegebene Secret (timing-safe).
  if (!process.env.OPERATOR_ONBOARD_SECRET) notFound();

  const entries = await db
    .select({
      id: schema.changelogEntries.id,
      title: schema.changelogEntries.title,
      publishedAt: schema.changelogEntries.publishedAt,
    })
    .from(schema.changelogEntries)
    .where(isNull(schema.changelogEntries.deletedAt))
    .orderBy(desc(schema.changelogEntries.publishedAt));

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Changelog verfassen
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Globale Produkt-News für die „Neu“-Seite. Sichtbar für alle
          eingeloggten Coaches und Bildungsträger.
        </p>
      </header>
      <ChangelogEditor entries={entries} />
    </div>
  );
}
