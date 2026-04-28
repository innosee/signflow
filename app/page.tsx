import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingCheckerTeaser } from "@/components/landing/checker-teaser";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero";
import { LandingHowItWorks } from "@/components/landing/how-it-works";
import { LandingNav } from "@/components/landing/nav";
import { LandingPricing } from "@/components/landing/pricing";
import { LandingWaitlist } from "@/components/landing/waitlist";
import { getCurrentSession } from "@/lib/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signflow — digitale AfA-Stundennachweise mit FES",
  description:
    "Stundennachweise für AVGS-Maßnahmen digital erfassen, von Coach und Teilnehmer:innen signieren, als A4-PDF mit fortgeschrittener elektronischer Signatur (FES) an die Agentur für Arbeit übermitteln.",
};

export default async function Home() {
  // Eingeloggte User landen direkt im jeweiligen Dashboard — die Landing
  // ist nur für Anonyme. Bootstrap-Redirect auf /setup (aus der vorherigen
  // Single-Tenant-Logik) entfällt, damit die öffentliche Startseite
  // erreichbar bleibt. Setup-Route ist manuell aufrufbar, bis der
  // Multi-Tenant-Bildungsträger-Signup die Bootstrap-Story sauber ablöst.
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <LandingHowItWorks />
        <LandingCheckerTeaser />
        <LandingFeatures />
        <LandingPricing />
        <LandingFaq />
        <LandingWaitlist />
      </main>
      <LandingFooter />
    </div>
  );
}
