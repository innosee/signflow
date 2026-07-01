"use client";

import { useActionState } from "react";

import { deleteCoach, impersonateCoach, resendCoachInvite } from "./actions";

export type CoachRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
};

export function CoachListItem({
  coach,
  canImpersonate,
}: {
  coach: CoachRow;
  /**
   * Owner-Gate: nur der älteste aktive BT-User des Tenants darf
   * Impersonation auslösen (siehe `impersonateCoach`-Server-Action +
   * `isTenantOwner` in dal.ts). Eingeladene BT-Kolleg:innen sehen den
   * Button nicht, damit sie nicht in einen 403-Redirect laufen.
   */
  canImpersonate: boolean;
}) {
  // Pro Zeile eigener Action-State → Inline-Feedback am Button („Sende… /
  // ✓ gesendet / Fehler"), unabhängig von den anderen Coaches.
  const [resendState, resendAction, resendPending] = useActionState(
    resendCoachInvite,
    undefined,
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="min-w-0">
        <div className="font-medium">{coach.name}</div>
        <div className="text-sm text-zinc-600">{coach.email}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {coach.emailVerified ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
              Aktiv
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              Einladung ausstehend
            </span>
          )}
          {coach.banned && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
              Deaktiviert
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!coach.emailVerified && (
          <form action={resendAction} className="flex items-center gap-2">
            <input type="hidden" name="coachId" value={coach.id} />
            <button
              type="submit"
              disabled={resendPending}
              title="Neuen Anmelde-Link (24 h gültig) an den Coach senden"
              className={
                resendState?.ok
                  ? "rounded-lg border border-green-500 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 enabled:hover:bg-green-100 disabled:opacity-60"
                  : "rounded-lg border border-zinc-500 px-3 py-1.5 text-sm enabled:hover:bg-zinc-50 disabled:opacity-60"
              }
            >
              {resendPending
                ? "Sende …"
                : resendState?.ok
                  ? "✓ Link gesendet"
                  : "Einladung erneut senden"}
            </button>
            {resendState?.error && (
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-red-700"
              >
                {resendState.error}
              </span>
            )}
          </form>
        )}
        {canImpersonate && (
          <form action={impersonateCoach}>
            <input type="hidden" name="userId" value={coach.id} />
            <button
              type="submit"
              className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Als Coach anmelden
            </button>
          </form>
        )}
        <form
          action={deleteCoach}
          onSubmit={(e) => {
            if (
              !confirm(
                `Coach „${coach.name}" wirklich löschen? Danach kann dieselbe E-Mail wieder neu eingeladen werden. Noch laufende (nicht-archivierte) Kurse blockieren das Löschen.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="coachId" value={coach.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            title="Coach löschen (nur wenn keine aktiven Kurse)"
          >
            Löschen
          </button>
        </form>
      </div>
    </li>
  );
}
