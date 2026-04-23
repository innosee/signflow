import { requireCoach } from "@/lib/dal";

import { ExportView } from "./export-view";

export const dynamic = "force-dynamic";

export default async function CheckerExportPage() {
  const session = await requireCoach();

  return <ExportView coachName={session.user.name} />;
}
