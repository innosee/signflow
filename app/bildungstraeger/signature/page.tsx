import Link from "next/link";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { resolveAssetUrl } from "@/lib/storage";

import { TenantSignatureSetup } from "./signature-setup";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ returnTo?: string }> };

export default async function BildungstraegerSignaturePage({
  searchParams,
}: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);

  // Zurück dorthin, wo der BT herkam (z.B. die Dokumente-Seite eines Kunden),
  // statt stumpf aufs Dashboard. Nur interne BT-Pfade zulassen (kein Open
  // Redirect); sonst Fallback aufs Dashboard.
  const { returnTo } = await searchParams;
  const backHref =
    returnTo && returnTo.startsWith("/bildungstraeger/")
      ? returnTo
      : "/bildungstraeger";
  const backLabel =
    backHref === "/bildungstraeger" ? "Zurück zum Dashboard" : "← Zurück";

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
          href={backHref}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          {backLabel}
        </Link>
      </header>

      <TenantSignatureSetup existingUrl={signatureUrl} />
    </div>
  );
}
