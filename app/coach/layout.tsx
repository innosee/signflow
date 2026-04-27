import { AppHeader } from "@/components/app-header";
import { getSigningEnabled, isImpersonating, requireCoach } from "@/lib/dal";

import { stopImpersonating } from "../bildungstraeger/actions";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCoach();
  const signingEnabled = await getSigningEnabled(session.user.id);

  // Checker ist für alle Coaches sichtbar. „Kurse" (Signatur-Flow) nur
  // für Pilot-Coaches mit `signing_enabled`, sonst führt der Link ins Leere
  // (Layout redirected).
  const navLinks = signingEnabled
    ? [
        { href: "/coach", label: "Kurse" },
        { href: "/coach/checker", label: "Berichts-Checker" },
        { href: "/coach/checker/check", label: "Ad-hoc-Check" },
      ]
    : [
        { href: "/coach/checker", label: "Berichts-Checker" },
        { href: "/coach/checker/check", label: "Ad-hoc-Check" },
      ];

  return (
    <>
      {/* Im Print-Modus (Ctrl+P oder Puppeteer → PDF) wird der AppHeader
          ausgeblendet — der gehört in Browser-Chrome, nicht ins AfA-Blatt. */}
      <div className="print:hidden">
        <AppHeader
          brandHref={signingEnabled ? "/coach" : "/coach/checker"}
          navLinks={navLinks}
          userName={session.user.name}
          userEmail={session.user.email}
          impersonating={isImpersonating(session)}
          logoutAction={logoutAction}
          stopImpersonationAction={stopImpersonating}
        />
      </div>
      <main className="flex-1">{children}</main>
    </>
  );
}
