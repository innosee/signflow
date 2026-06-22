import Link from "next/link";

import { getActiveRole, requireSession } from "@/lib/dal";
import { getPendingInvitations } from "@/lib/memberships";
import { acceptInvitation, declineInvitation } from "@/lib/tenant-actions";

export const dynamic = "force-dynamic";

const roleLabel = (role: string) =>
  role === "bildungstraeger" ? "Bildungsträger" : "Coach";

/**
 * Offene Einladungen des eingeloggten Nutzers (Membership-Modell). Wer als Coach
 * zu einem weiteren Bildungsträger eingeladen wurde, nimmt sie hier aktiv an
 * (oder lehnt ab). Erst nach dem Annehmen gibt die Mitgliedschaft Zugriff.
 */
export default async function EinladungenPage() {
  const session = await requireSession();
  const invitations = await getPendingInvitations(session.user.id);
  const backHref =
    getActiveRole(session) === "bildungstraeger" ? "/bildungstraeger" : "/coach";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Deine Einladungen
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Du wurdest zu folgenden Bildungsträgern eingeladen. Nimm an, um dort
            zu arbeiten — danach kannst du oben im Menü zwischen deinen Trägern
            wechseln.
          </p>
        </div>

        {invitations.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
            Du hast aktuell keine offenen Einladungen.
          </p>
        ) : (
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <li
                key={inv.tenantId}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-zinc-900">
                    {inv.tenantName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    als {roleLabel(inv.role)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form action={declineInvitation}>
                    <input type="hidden" name="tenantId" value={inv.tenantId} />
                    <button
                      type="submit"
                      className="rounded-lg border border-zinc-400 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      Ablehnen
                    </button>
                  </form>
                  <form action={acceptInvitation}>
                    <input type="hidden" name="tenantId" value={inv.tenantId} />
                    <button
                      type="submit"
                      className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Annehmen
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-sm text-zinc-600">
          <Link href={backHref} className="font-medium text-zinc-900 underline">
            Zurück
          </Link>
        </p>
      </div>
    </div>
  );
}
