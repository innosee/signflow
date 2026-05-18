"use client";

import { deactivateBildungstraeger } from "../actions";

export type BtUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
};

export function BtUserListItem({
  user,
  isOwner,
  isSelf,
}: {
  user: BtUserRow;
  isOwner: boolean;
  isSelf: boolean;
}) {
  const canDeactivate = !isSelf && !isOwner;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="min-w-0">
        <div className="font-medium">
          {user.name}
          {isSelf && (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              (du)
            </span>
          )}
        </div>
        <div className="text-sm text-zinc-600">{user.email}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {isOwner && (
            <span
              className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800"
              title="Ältester aktiver BT-User des Tenants — darf als Einziger Coaches impersonaten."
            >
              Owner
            </span>
          )}
          {user.emailVerified ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
              Aktiv
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              Einladung ausstehend
            </span>
          )}
          {user.banned && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
              Deaktiviert
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canDeactivate ? (
          <form
            action={deactivateBildungstraeger}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Account „${user.name}" wirklich deaktivieren? Die Person verliert sofort den Zugang; eingereichte Berichte bleiben sichtbar.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Deaktivieren
            </button>
          </form>
        ) : (
          <span
            className="text-xs text-zinc-400"
            title={
              isSelf
                ? "Eigener Account — Self-Lockout-Schutz"
                : "Owner-Account — geschützt"
            }
          >
            geschützt
          </span>
        )}
      </div>
    </li>
  );
}
