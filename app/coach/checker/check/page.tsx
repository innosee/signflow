import Link from "next/link";

import { requireCoach } from "@/lib/dal";

import { CheckerForm } from "./checker-form";

export const dynamic = "force-dynamic";

export default async function CheckerCheckPage() {
  const session = await requireCoach();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      <div>
        <Link
          href="/coach/checker"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Bericht prüfen
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Automatische Prüfung deines TN-bezogenen Abschlussberichts gegen die
          Vorgaben des Bildungsträgers — inklusive konkreter
          Umformulierungs-Vorschläge, wo nötig.
        </p>
      </div>

      <CheckerForm userId={session.user.id} />
    </div>
  );
}
