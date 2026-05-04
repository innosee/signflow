import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { getTenantId, requireCoach } from "@/lib/dal";

import { ExportView } from "./export-view";

export const dynamic = "force-dynamic";

export default async function CheckerExportPage() {
  const session = await requireCoach();
  const tenantId = getTenantId(session);

  const [branding, coachRow] = await Promise.all([
    getBranding(tenantId),
    db
      .select({ signatureUrl: schema.users.signatureUrl })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  return (
    <ExportView
      coachName={session.user.name}
      coachSignatureUrl={coachRow?.signatureUrl ?? null}
      branding={branding}
    />
  );
}
