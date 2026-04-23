import { AppHeader } from "@/components/app-header";
import { isImpersonating, requireCoach } from "@/lib/dal";

import { stopImpersonating } from "../bildungstraeger/actions";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCoach();

  return (
    <>
      {/* Im Print-Modus (Ctrl+P oder Puppeteer → PDF) wird der AppHeader
          ausgeblendet — der gehört in Browser-Chrome, nicht ins AfA-Blatt. */}
      <div className="print:hidden">
        <AppHeader
          brandHref="/coach"
          navLinks={[
            { href: "/coach", label: "Kurse" },
            { href: "/coach/checker", label: "Berichts-Checker" },
          ]}
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
