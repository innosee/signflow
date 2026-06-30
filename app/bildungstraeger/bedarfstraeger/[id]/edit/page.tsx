import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";

import { updateBedarfstraeger } from "../../actions";
import { BedarfstraegerForm } from "../../form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditBedarfstraegerPage({ params }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  const { id } = await params;

  // Tenant-Scope: nur eigene Behörden sind sichtbar/editierbar.
  const [row] = await db
    .select({
      id: schema.bedarfstraeger.id,
      name: schema.bedarfstraeger.name,
      type: schema.bedarfstraeger.type,
      adresse: schema.bedarfstraeger.adresse,
      kontaktPerson: schema.bedarfstraeger.kontaktPerson,
      email: schema.bedarfstraeger.email,
    })
    .from(schema.bedarfstraeger)
    .where(
      and(
        eq(schema.bedarfstraeger.id, id),
        eq(schema.bedarfstraeger.tenantId, tenantId),
        isNull(schema.bedarfstraeger.deletedAt),
      ),
    )
    .limit(1);

  if (!row) notFound();

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bedarfsträger bearbeiten
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Änderungen wirken sich auf neue Kursanlagen aus. Bereits erstellte
          Kurse behalten ihren Bezug.
        </p>
      </header>
      <BedarfstraegerForm
        action={updateBedarfstraeger}
        bedarfstraegerId={row.id}
        initial={{
          name: row.name,
          type: row.type,
          adresse: row.adresse,
          kontaktPerson: row.kontaktPerson,
          email: row.email,
        }}
        submitLabel="Speichern"
        pendingLabel="Wird gespeichert…"
      />
    </div>
  );
}
