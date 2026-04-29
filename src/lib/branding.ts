import "server-only";

import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

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

const DEFAULT_ADDRESS = [
  "Ekkehardstraße 12b",
  "D-78224 Singen",
  "Tel. +49 (0) 7731 / 90 97 18 - 10",
  "Fax +49 (0) 7731 / 90 97 18 - 11",
  "avgs@erango.de",
  "www.erango.de",
].join("\n");

export const DEFAULT_BRANDING: Branding = {
  logoUrl: null,
  address: DEFAULT_ADDRESS,
};

/**
 * Lädt das Branding des einzigen Bildungsträgers im Deployment.
 * React.cache → eine Query pro Request, auch wenn mehrere Stellen das
 * Branding lesen (Export-Page, Settings-Page).
 */
export const getBranding = cache(async (): Promise<Branding> => {
  const [row] = await db
    .select({
      logoUrl: schema.users.pdfLogoUrl,
      address: schema.users.pdfAddress,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "bildungstraeger"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return DEFAULT_BRANDING;

  return {
    logoUrl: row.logoUrl ?? null,
    address: row.address && row.address.trim().length > 0
      ? row.address
      : DEFAULT_ADDRESS,
  };
});
