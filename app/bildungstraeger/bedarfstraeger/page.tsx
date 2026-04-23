import Link from "next/link";
import { asc, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";

export const dynamic = "force-dynamic";

const TYPE_LABEL = {
  JC: "Jobcenter",
  AA: "Arbeitsagentur",
} as const;

export default async function BedarfstraegerListPage() {
  await requireBildungstraeger();

  const rows = await db
    .select({
      id: schema.bedarfstraeger.id,
      name: schema.bedarfstraeger.name,
      type: schema.bedarfstraeger.type,
      adresse: schema.bedarfstraeger.adresse,
      kontaktPerson: schema.bedarfstraeger.kontaktPerson,
      email: schema.bedarfstraeger.email,
    })
    .from(schema.bedarfstraeger)
    .where(isNull(schema.bedarfstraeger.deletedAt))
    .orderBy(asc(schema.bedarfstraeger.name));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bedarfsträger
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Jobcenter und Arbeitsagenturen, die Kurse finanzieren. Coaches
            wählen bei der Kursanlage aus dieser Liste.
          </p>
        </div>
        <Link
          href="/bildungstraeger/bedarfstraeger/new"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Neuer Bedarfsträger
        </Link>
      </header>

      <section className="rounded-xl border border-zinc-300 bg-white">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Noch keine Bedarfsträger hinterlegt. Lege den ersten an — erst dann
            können Coaches Kurse erstellen.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {rows.map((b) => (
              <li key={b.id} className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                    {TYPE_LABEL[b.type]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-0.5">
                  {b.adresse && <span>{b.adresse}</span>}
                  {b.kontaktPerson && <span>{b.kontaktPerson}</span>}
                  {b.email && <span>{b.email}</span>}
                  {!b.adresse && !b.kontaktPerson && !b.email && (
                    <span className="italic">Keine Zusatzdaten</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
