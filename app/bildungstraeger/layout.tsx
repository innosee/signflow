import { AppHeader } from "@/components/app-header";
import { isImpersonating, requireBildungstraeger } from "@/lib/dal";

import { logoutAction } from "../login/actions";
import { stopImpersonating } from "./actions";

export const dynamic = "force-dynamic";

export default async function BildungstraegerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBildungstraeger();

  return (
    <>
      {/* Im Print-Modus (BER-Review-PDF) wird der AppHeader ausgeblendet. */}
      <div className="print:hidden">
        <AppHeader
          brandHref="/bildungstraeger"
          navLinks={[
            { href: "/bildungstraeger", label: "Dashboard" },
            { href: "/bildungstraeger/bedarfstraeger", label: "Bedarfsträger" },
          ]}
          userName={session.user.name}
          userEmail={session.user.email}
          settingsHref="/bildungstraeger/settings"
          impersonating={isImpersonating(session)}
          logoutAction={logoutAction}
          stopImpersonationAction={stopImpersonating}
        />
      </div>
      <main className="flex-1">{children}</main>
    </>
  );
}
