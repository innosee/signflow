import "server-only";

import { cache } from "react";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { resolveAssetUrl } from "@/lib/storage";
import type { TnbAssets } from "@/lib/documents/tnb-public";

/**
 * Löst Logo + Organisations-Unterschrift für die öffentliche /tnb-Bescheinigung
 * auf. Da die Seite login-frei ist, gibt es keinen Session-Tenant — die Assets
 * kommen fest vom erango-Tenant (die /tnb-App stellt erango-Bescheinigungen aus).
 *
 * Tenant-Auflösung (erste Treffer gewinnt):
 *  1. `TNB_TENANT_ID` (explizit gesetzte Tenant-UUID) — robust in Multi-Tenant.
 *  2. Tenant mit „erango" im Namen/Slug (aktiv).
 *  3. Genau EIN aktiver Tenant → dieser (Single-Tenant-Prod).
 * Kein Treffer → beide Assets `null` (Template rendert Logo-Text-Fallback und
 * lässt die Signatur-Zeile leer). React.cache: eine Auflösung pro Request.
 */
export const loadTnbErangoAssets = cache(async (): Promise<TnbAssets> => {
  // Öffentliche Seite: Asset-Auflösung darf die Bescheinigung NIE crashen.
  // Fällt sie aus (Tenant fehlt, Storage-Fehler), rendert das Template den
  // Logo-Text-Fallback + leere Signatur-Zeile statt einer 500.
  try {
    const tenantId = await resolveTnbTenantId();
    if (!tenantId) return { logoUrl: null, orgSignatureUrl: null };

    const [tenantRow] = await db
      .select({ signatureUrl: schema.tenants.signatureUrl })
      .from(schema.tenants)
      .where(and(eq(schema.tenants.id, tenantId), isNull(schema.tenants.deletedAt)))
      .limit(1);

    const branding = await getBranding(tenantId);
    const orgSignatureUrl = await resolveAssetUrl(tenantRow?.signatureUrl);

    return { logoUrl: branding.logoUrl, orgSignatureUrl };
  } catch (err) {
    console.error("loadTnbErangoAssets failed:", err);
    return { logoUrl: null, orgSignatureUrl: null };
  }
});

async function resolveTnbTenantId(): Promise<string | null> {
  const explicit = process.env.TNB_TENANT_ID?.trim();
  if (explicit) return explicit;

  const [byName] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(and(ilike(schema.tenants.name, "%erango%"), isNull(schema.tenants.deletedAt)))
    .orderBy(asc(schema.tenants.createdAt))
    .limit(1);
  if (byName) return byName.id;

  // Single-Tenant-Fallback: nur wenn es genau EINEN aktiven Tenant gibt.
  const active = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(isNull(schema.tenants.deletedAt))
    .orderBy(asc(schema.tenants.createdAt))
    .limit(2);
  return active.length === 1 ? active[0].id : null;
}
