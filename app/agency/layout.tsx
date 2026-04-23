import { AppHeader } from "@/components/app-header";
import { isImpersonating, requireAgency } from "@/lib/dal";

import { logoutAction } from "../login/actions";
import { stopImpersonating } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAgency();

  return (
    <>
      {/* Im Print-Modus (BER-Review-PDF) wird der AppHeader ausgeblendet. */}
      <div className="print:hidden">
        <AppHeader
          brandHref="/agency"
          navLinks={[
            { href: "/agency", label: "Dashboard" },
            { href: "/agency/bedarfstraeger", label: "Bedarfsträger" },
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
