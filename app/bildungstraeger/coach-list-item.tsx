"use client";

import { useActionState, useState, useTransition } from "react";

import {
  deleteCoach,
  impersonateCoach,
  resendCoachInvite,
  updateCoach,
} from "./actions";

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

  const [editing, setEditing] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdating, startUpdate] = useTransition();
  // Speichern über eine Transition: bei Erfolg das Formular schließen (event-
  // getrieben, kein setState-in-Effect), sonst Fehler inline zeigen. Die
  // revalidierten Werte kommen per Server-Refresh in die Anzeige.
  const handleUpdate = (formData: FormData) => {
    startUpdate(async () => {
      const res = await updateCoach(undefined, formData);
      if (res?.ok) {
        setUpdateError(null);
        setEditing(false);
      } else {
        setUpdateError(res?.error ?? "Änderung fehlgeschlagen.");
      }
    });
  };

  if (editing) {
    return (
      <li className="px-6 py-4">
        <form action={handleUpdate} className="flex flex-col gap-3">
          <input type="hidden" name="coachId" value={coach.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Name
              </span>
              <input
                name="name"
                defaultValue={coach.name}
                required
                autoFocus
                className="w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                E-Mail
              </span>
              <input
                name="email"
                type="email"
                defaultValue={coach.email}
                required
                className="w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isUpdating}
              className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-60"
            >
              {isUpdating ? "Speichere …" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUpdateError(null);
                setEditing(false);
              }}
              className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Abbrechen
            </button>
            {updateError && (
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-red-700"
              >
                {updateError}
              </span>
            )}
          </div>
          {!coach.emailVerified && (
            <p className="text-xs text-zinc-500">
              Hinweis: Der bereits verschickte Einladungs-Link zeigt auf die alte
              Adresse. Nach einer E-Mail-Änderung „Einladung erneut senden“.
            </p>
          )}
        </form>
      </li>
    );
  }

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
        <button
          type="button"
          onClick={() => {
            setUpdateError(null);
            setEditing(true);
          }}
          className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          title="Name oder E-Mail des Coaches ändern"
        >
          Bearbeiten
        </button>
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
