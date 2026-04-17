import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireAgency } from "@/lib/dal";

import { logoutAction } from "../login/actions";
import { impersonateCoach } from "./actions";
import { InviteCoachForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function AgencyDashboard() {
  const session = await requireAgency();

  const coaches = await db
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
      and(eq(schema.users.role, "coach"), isNull(schema.users.deletedAt)),
    )
    .orderBy(desc(schema.users.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Agency Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Angemeldet als {session.user.name} ({session.user.email})
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Abmelden
          </button>
        </form>
      </header>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold">Coach einladen</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Der Coach erhält eine E-Mail mit Link zum Passwort-Setzen.
        </p>
        <div className="mt-4">
          <InviteCoachForm />
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white">
        <div className="border-b border-black/10 px-6 py-4">
          <h2 className="text-lg font-semibold">Coaches ({coaches.length})</h2>
        </div>
        {coaches.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">
            Noch keine Coaches. Lade den ersten oben ein.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {coaches.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-zinc-600">{c.email}</div>
                  <div className="mt-1 flex gap-2 text-xs">
                    {c.emailVerified ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                        Aktiv
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                        Einladung ausstehend
                      </span>
                    )}
                    {c.banned && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
                        Deaktiviert
                      </span>
                    )}
                  </div>
                </div>
                <form action={impersonateCoach}>
                  <input type="hidden" name="userId" value={c.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    Als Coach anmelden
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
