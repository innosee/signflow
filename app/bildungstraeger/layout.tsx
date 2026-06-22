import { AppHeader } from "@/components/app-header";
import { TenantSwitcher } from "@/components/tenant-switcher";
import {
  getTenantId,
  isImpersonating,
  requireBildungstraeger,
} from "@/lib/dal";
import { getTenantSwitcherData } from "@/lib/memberships";

import { logoutAction } from "../login/actions";
import { stopImpersonating } from "./actions";

export const dynamic = "force-dynamic";

export default async function BildungstraegerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBildungstraeger();
  const switcher = await getTenantSwitcherData(
    session.user.id,
    getTenantId(session),
  );

  return (
    <>
      {/* Im Print-Modus (BER-Review-PDF) wird der AppHeader ausgeblendet. */}
      <div className="print:hidden">
        <AppHeader
          brandHref="/bildungstraeger"
          navLinks={[
            { href: "/bildungstraeger", label: "Dashboard" },
            { href: "/bildungstraeger/courses", label: "Kunden" },
            { href: "/bildungstraeger/checker", label: "Bericht prüfen" },
            { href: "/bildungstraeger/bedarfstraeger", label: "Bedarfsträger" },
            // „Team" bewusst ausgeblendet: der erste Kunde nutzt EINE
            // gemeinsame Login-Adresse für alle. Die Route /bildungstraeger/team
            // bleibt per URL erreichbar (Coach-Einladung/-Verwaltung), ist aber
            // nicht mehr prominent in der Navigation.
          ]}
          tenantSwitcher={
            <TenantSwitcher
              memberships={switcher.memberships}
              activeTenantId={switcher.activeTenantId}
              activeTenantName={switcher.activeTenantName}
            />
          }
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
