import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";

import { CourseForm } from "./course-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  const bedarfstraeger = await db
    .select({
      id: schema.bedarfstraeger.id,
      name: schema.bedarfstraeger.name,
      type: schema.bedarfstraeger.type,
    })
    .from(schema.bedarfstraeger)
    .where(
      and(
        eq(schema.bedarfstraeger.tenantId, tenantId),
        isNull(schema.bedarfstraeger.deletedAt),
      ),
    )
    .orderBy(asc(schema.bedarfstraeger.name));

  const coaches = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "coach"),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.users.deletedAt),
      ),
    )
    .orderBy(asc(schema.users.name));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Neuer Kunde</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kopfdaten für den AfA-Stundennachweis. Nach dem Anlegen erscheint der
          Kunde beim zugewiesenen Coach, der dann die Termine erfasst.
        </p>
      </header>

      {bedarfstraeger.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Es ist noch kein Bedarfsträger hinterlegt. Bitte zuerst unter
          „Bedarfsträger" einen anlegen — erst dann lässt sich ein Kunde
          erfassen.
        </div>
      ) : coaches.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Es ist noch kein Coach im Team. Bitte zuerst unter „Team" einen Coach
          einladen — ein Kunde muss einem Coach zugewiesen werden.
        </div>
      ) : (
        <CourseForm bedarfstraeger={bedarfstraeger} coaches={coaches} />
      )}
    </div>
  );
}
