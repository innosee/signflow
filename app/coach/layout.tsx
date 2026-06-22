import { AppHeader } from "@/components/app-header";
import {
  CoachToolAccentStrip,
  CoachToolNav,
  CoachToolSubBrand,
} from "@/components/coach-tool-nav";
import { TenantSwitcher } from "@/components/tenant-switcher";
import {
  getSigningEnabled,
  getTenantId,
  isImpersonating,
  requireCoach,
} from "@/lib/dal";
import { getTenantSwitcherData } from "@/lib/memberships";

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
  const switcher = await getTenantSwitcherData(
    session.user.id,
    getTenantId(session),
  );

  return (
    <>
      {/* Im Print-Modus (Ctrl+P oder Puppeteer → PDF) wird der AppHeader
          ausgeblendet — der gehört in Browser-Chrome, nicht ins AfA-Blatt. */}
      <div className="print:hidden">
        <AppHeader
          brandHref={signingEnabled ? "/coach" : "/coach/checker"}
          brandSubText={<CoachToolSubBrand signingEnabled={signingEnabled} />}
          customNav={<CoachToolNav signingEnabled={signingEnabled} />}
          accentStrip={
            <CoachToolAccentStrip signingEnabled={signingEnabled} />
          }
          tenantSwitcher={
            <TenantSwitcher
              memberships={switcher.memberships}
              activeTenantId={switcher.activeTenantId}
              activeTenantName={switcher.activeTenantName}
            />
          }
          userName={session.user.name}
          userEmail={session.user.email}
          settingsHref="/coach/settings"
          impersonating={isImpersonating(session)}
          logoutAction={logoutAction}
          stopImpersonationAction={stopImpersonating}
        />
      </div>
      <main className="flex-1">{children}</main>
    </>
  );
}
