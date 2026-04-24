import { asc, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSigningEnabled } from "@/lib/dal";

import { CourseForm } from "./course-form";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  await requireSigningEnabled();

  const bedarfstraeger = await db
    .select({
      id: schema.bedarfstraeger.id,
      name: schema.bedarfstraeger.name,
      type: schema.bedarfstraeger.type,
    })
    .from(schema.bedarfstraeger)
    .where(isNull(schema.bedarfstraeger.deletedAt))
    .orderBy(asc(schema.bedarfstraeger.name));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Neuer Kurs</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kopfdaten für den AfA-Stundennachweis und die Teilnehmer-Liste.
          Sessions legst du danach im Kurs-Dashboard an.
        </p>
      </header>

      {bedarfstraeger.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Dein Bildungsträger hat noch keine Bedarfsträger hinterlegt. Bitte
          wende dich an den Bildungsträger — erst wenn mindestens ein
          Bedarfsträger existiert, kannst du einen Kurs anlegen.
        </div>
      ) : (
        <CourseForm bedarfstraeger={bedarfstraeger} />
      )}
    </div>
  );
}
