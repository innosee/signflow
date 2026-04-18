import { AppHeader } from "@/components/app-header";
import { isImpersonating, requireCoach } from "@/lib/dal";

import { stopImpersonating } from "../agency/actions";
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
      <AppHeader
        brandHref="/coach"
        navLinks={[{ href: "/coach", label: "Kurse" }]}
        userName={session.user.name}
        userEmail={session.user.email}
        impersonating={isImpersonating(session)}
        logoutAction={logoutAction}
        stopImpersonationAction={stopImpersonating}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
