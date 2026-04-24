"use client";

import { deleteCoach, impersonateCoach, setCoachSigningEnabled } from "./actions";

export type CoachRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
  signingEnabled: boolean;
};

export function CoachListItem({ coach }: { coach: CoachRow }) {
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
          {coach.signingEnabled ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
              Signatur freigeschaltet
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
              Nur Checker
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <form action={setCoachSigningEnabled}>
          <input type="hidden" name="coachId" value={coach.id} />
          <input
            type="hidden"
            name="enabled"
            value={coach.signingEnabled ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
            title={
              coach.signingEnabled
                ? "Signatur-Modul für diesen Coach sperren"
                : "Signatur-Modul für diesen Coach freischalten"
            }
          >
            {coach.signingEnabled ? "Signatur sperren" : "Signatur freischalten"}
          </button>
        </form>
        <form action={impersonateCoach}>
          <input type="hidden" name="userId" value={coach.id} />
          <button
            type="submit"
            className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Als Coach anmelden
          </button>
        </form>
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
