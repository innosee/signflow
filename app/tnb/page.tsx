import type { Metadata } from "next";

import { loadTnbErangoAssets } from "@/lib/documents/tnb-erango-assets";
import { hasTnbAccess } from "@/lib/documents/tnb-access";
import { TnbConfigurator } from "./tnb-configurator";
import { TnbGate } from "./tnb-gate";

/**
 * Öffentliche, login-freie Mini-App: Teilnahmebescheinigung ad hoc für
 * Kund:innen konfigurieren, die (noch) nicht in Signflow angelegt sind, und als
 * PDF drucken. Kein DB-Schreibzugriff, kein Mailversand.
 *
 * `/tnb` liegt bewusst NICHT unter /coach oder /bildungstraeger → der
 * proxy.ts-Auth-Guard lässt die Route unangetastet (public by default).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teilnahmebescheinigung erstellen",
  description:
    "Teilnahmebescheinigung ausfüllen und als PDF drucken — ohne Login.",
  robots: { index: false, follow: false },
};

export default async function TnbPage() {
  // Zugangscode-Schutz (kein Login, nur geteilter Code) — sonst könnten
  // Beliebige echt aussehende erango-Bescheinigungen erzeugen.
  if (!(await hasTnbAccess())) {
    return <TnbGate />;
  }

  // Festes erango-Branding + Org-Signatur (login-frei → kein Session-Tenant).
  const assets = await loadTnbErangoAssets();
  return <TnbConfigurator assets={assets} />;
}
