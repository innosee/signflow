import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type TenantBewilligungSettings = {
  /** Ist „Bewilligung nach Zeitraum" für diesen Träger freigeschaltet? */
  bewilligungZeitraumEnabled: boolean;
  /** Zertifizierte Obergrenzen (AZAV-Zulassung) des Trägers. */
  zertMaxUe: number;
  zertMaxWochen: number;
};

/**
 * Bewilligungs-Einstellungen eines Trägers. Bewusst NICHT im Code hartcodiert:
 * Zertifikate laufen aus, und ein zweiter Träger hat andere Grenzen.
 *
 * React.cache mit tenantId als Key → eine Query pro (Request, Tenant).
 * Fällt für unbekannte Tenants auf die konservativen Defaults zurück (Option
 * aus, erango-Zertifizierungswerte) — nie auf „alles erlaubt".
 */
export const getTenantBewilligung = cache(
  async (tenantId: string): Promise<TenantBewilligungSettings> => {
    const [row] = await db
      .select({
        bewilligungZeitraumEnabled: schema.tenants.bewilligungZeitraumEnabled,
        zertMaxUe: schema.tenants.zertMaxUe,
        zertMaxWochen: schema.tenants.zertMaxWochen,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return (
      row ?? {
        bewilligungZeitraumEnabled: false,
        zertMaxUe: 80,
        zertMaxWochen: 16,
      }
    );
  },
);
