import Link from "next/link";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { resolveAssetUrl } from "@/lib/storage";

import { TenantSignatureSetup } from "./signature-setup";

export const dynamic = "force-dynamic";

export default async function BildungstraegerSignaturePage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  const [row] = await db
    .select({ signatureUrl: schema.tenants.signatureUrl })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const signatureUrl = await resolveAssetUrl(row?.signatureUrl);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bildungsträger-Unterschrift
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Einmalig anlegen — geteilt für die gesamte Organisation, wird auf den
            Bildungsträger-Dokumenten verwendet.
          </p>
        </div>
        <Link
          href="/bildungstraeger"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          Zurück zum Dashboard
        </Link>
      </header>

      <TenantSignatureSetup existingUrl={signatureUrl} />
    </div>
  );
}
