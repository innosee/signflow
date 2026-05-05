import "server-only";

import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { resolveAssetUrl } from "@/lib/storage";

/**
 * PDF-Branding für Header (Logo + Postanschrift). In Single-Tenant kommen
 * Logo und Adresse aus der `bildungstraeger`-User-Zeile; Coaches lesen das
 * gemeinsame Branding ihres Mandanten beim BER-Export. Mit dem Multi-Tenant-
 * Schema-Change wandern die Felder auf eine spätere Org-Tabelle.
 *
 * Defaults sind die bestehenden Erango-Werte aus dem hartcodierten
 * BerDocument-Header — so bleibt das PDF auch dann konsistent, wenn das
 * Branding (noch) nicht explizit gesetzt wurde.
 */
export type Branding = {
  logoUrl: string | null;
  address: string;
};

/**
 * Multi-Tenant-Default ist bewusst LEER — kein Hardcoded-Bildungsträger
 * mehr. Single-Tenant-Defaults (Erango-Adresse) waren im Multi-Tenant-
 * Setup ein Datenleck, sobald ein zweiter Mandant ein PDF rendert.
 *
 * Konsequenz: Ein BT muss seine Adresse + Logo in /bildungstraeger/settings
 * setzen, sonst rendert das BER-PDF einen leeren Header.
 */
export const DEFAULT_BRANDING: Branding = {
  logoUrl: null,
  address: "",
};

/**
 * Lädt das Branding des Bildungsträgers für den angegebenen Tenant.
 * Pflicht-Argument seit Multi-Tenant — vorher las die Funktion blind den
 * ersten BT-User der DB, was im Multi-Tenant-Setup das Branding eines
 * fremden Mandanten liefern könnte.
 *
 * React.cache + tenantId als Cache-Key → eine Query pro (Request, Tenant),
 * auch wenn mehrere Stellen das Branding lesen.
 */
export const getBranding = cache(
  async (tenantId: string): Promise<Branding> => {
    const [row] = await db
      .select({
        logoUrl: schema.users.pdfLogoUrl,
        address: schema.users.pdfAddress,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.users.role, "bildungstraeger"),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);

    if (!row) return DEFAULT_BRANDING;

    // Logo: Object-Key (R2) wird zu signed URL, https-URLs (Vercel-Blob-
    // Bestand) bleiben unverändert.
    const logoUrl = await resolveAssetUrl(row.logoUrl);

    return {
      logoUrl,
      address: row.address ?? "",
    };
  },
);
