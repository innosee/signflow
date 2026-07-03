"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

import { shouldLoadAnalytics } from "@/lib/analytics-privacy";

/**
 * Lädt das cookielose Analytics-Script — aber NICHT auf den öffentlichen
 * Magic-Link-Seiten (`/sign/<token>`). Der Token steht dort im Pfad und ist
 * 7 Tage lang gültig (voller Zugriff auf die TN-Daten + Signaturfunktion); ein
 * Pageview-Ping mit URL würde ihn an das Analytics-System leaken. Teilnehmer
 * auf der Sign-Seite zu tracken ist ohnehin weder nötig noch gewollt.
 *
 * Als Client-Component, weil die Pfad-Entscheidung `usePathname()` braucht. Die
 * eigentliche Regel liegt in `shouldLoadAnalytics` (rein + unit-getestet).
 */
export function AnalyticsScript() {
  const pathname = usePathname();
  if (!shouldLoadAnalytics(pathname)) return null;

  return (
    <Script
      defer
      data-site="ee34940a692a9f04"
      src="https://mini-analytics-innosee-team.vercel.app/script.js"
      strategy="afterInteractive"
    />
  );
}
