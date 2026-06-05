import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  getTenantId,
  getTenantOwnerId,
  requireBildungstraeger,
} from "@/lib/dal";

import { BtInviteForm } from "./bt-invite-form";
import { BtUserListItem } from "./bt-user-list-item";

export const dynamic = "force-dynamic";

const TEAM_ERRORS: Record<string, string> = {
  invalid: "Ungültige Anfrage.",
  unknown: "Dieser Account existiert nicht (mehr) in deinem Tenant.",
  self: "Du kannst deinen eigenen Account nicht deaktivieren.",
  owner_locked:
    "Der Owner-Account kann nicht deaktiviert werden — er ist die einzige Stelle, die Coaches impersonaten darf.",
};

type Props = {
  searchParams: Promise<{ team_error?: string }>;
};

export default async function BtTeamPage({ searchParams }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { team_error } = await searchParams;
  const teamErrorMsg = team_error ? TEAM_ERRORS[team_error] : undefined;

  const [users, ownerId] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        emailVerified: schema.users.emailVerified,
        banned: schema.users.banned,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "bildungstraeger"),
          eq(schema.users.tenantId, tenantId),
          isNull(schema.users.deletedAt),
        ),
      )
      .orderBy(asc(schema.users.createdAt)),
    getTenantOwnerId(tenantId),
  ]);

  const currentUserId = session.user.id;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Bildungsträger-Accounts in deinem Tenant. Alle haben dieselben
          Datenrechte (Coaches verwalten, Berichte prüfen, weitere Personen
          einladen). Nur der Owner darf Coaches impersonaten.
        </p>
      </header>

      {teamErrorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {teamErrorMsg}
        </div>
      )}

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <h2 className="text-lg font-semibold">Kolleg:in einladen</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Die Person bekommt eine E-Mail mit Link zum Passwort-Setzen. Ab dem
          ersten Login arbeitet sie mit eigenem Account am selben Berichts-
          und Coach-Pool.
        </p>
        <div className="mt-4">
          <BtInviteForm />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Accounts ({users.length})
          </h2>
        </div>
        <ul className="divide-y divide-black/5">
          {users.map((u) => (
            <BtUserListItem
              key={u.id}
              user={u}
              isOwner={u.id === ownerId}
              isSelf={u.id === currentUserId}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
