import { requireCoach, isImpersonating } from "@/lib/dal";

import { logoutAction } from "../login/actions";
import { stopImpersonating } from "../agency/actions";

export const dynamic = "force-dynamic";

export default async function CoachDashboard() {
  const session = await requireCoach();
  const impersonating = isImpersonating(session);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-6">
      {impersonating && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div>
            <strong>Impersonation aktiv.</strong> Du siehst die Oberfläche als{" "}
            {session.user.name}. Schreibende Aktionen sind blockiert.
          </div>
          <form action={stopImpersonating}>
            <button
              type="submit"
              className="rounded-lg border border-amber-400 px-3 py-1 text-sm hover:bg-amber-100"
            >
              Impersonation beenden
            </button>
          </form>
        </div>
      )}

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Coach Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Angemeldet als {session.user.name} ({session.user.email})
          </p>
        </div>
        {!impersonating && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Abmelden
            </button>
          </form>
        )}
      </header>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <h2 className="text-lg font-semibold">Kurse</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Noch keine Kurse. Die Kursverwaltung folgt in der nächsten Phase.
        </p>
      </section>
    </div>
  );
}
