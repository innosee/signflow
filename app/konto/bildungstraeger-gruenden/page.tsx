import Link from "next/link";

import { getActiveRole, requireSession } from "@/lib/dal";

import { FoundBtForm } from "./found-form";

export const dynamic = "force-dynamic";

/**
 * „Bildungsträger gründen" für eine bereits eingeloggte Identität. Auth-gated
 * Gegenstück zum öffentlichen `/register`: ein bestehender User (typischerweise
 * ein Coach) legt seinen eigenen Bildungsträger an und wird direkt in dessen
 * Kontext geschaltet. Eine Identität, mehrere Mitgliedschaften.
 */
export default async function FoundBildungstraegerPage() {
  const session = await requireSession();
  const backHref =
    getActiveRole(session) === "bildungstraeger" ? "/bildungstraeger" : "/coach";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Eigenen Bildungsträger gründen
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Du legst mit deinem bestehenden Konto ({session.user.email}) einen
            neuen Bildungsträger an und wirst dort Administrator. Dein bisheriger
            Zugang bleibt erhalten — du kannst jederzeit oben im Menü zwischen
            deinen Trägern wechseln.
          </p>
        </div>

        <FoundBtForm />

        <p className="text-center text-sm text-zinc-600">
          <Link href={backHref} className="font-medium text-zinc-900 underline">
            Zurück
          </Link>
        </p>
      </div>
    </div>
  );
}
