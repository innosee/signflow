import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireAgency } from "@/lib/dal";

import { impersonateCoach } from "./actions";
import { InviteCoachForm } from "./invite-form";

export const dynamic = "force-dynamic";

const IMP_ERRORS: Record<string, string> = {
  invalid: "Ungültiger Coach.",
  unknown: "Dieser Coach existiert nicht (mehr).",
  banned: "Coach ist gesperrt — Impersonation nicht möglich.",
  api: "Impersonation von Better Auth abgelehnt.",
};

type Props = {
  searchParams: Promise<{ imp_error?: string }>;
};

export default async function AgencyDashboard({ searchParams }: Props) {
  await requireAgency();
  const { imp_error } = await searchParams;
  const impErrorMsg = imp_error ? IMP_ERRORS[imp_error] : undefined;

  // Offene AfA-Übermittlungen (gesiegelt, aber noch nicht an die AfA raus)
  // — als Teaser oben in der Übersicht anzeigen, damit der Firmen-User
  // direkt sieht, dass Arbeit im Stapel liegt.
  const [pendingSubmissionsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.finalDocuments)
    .where(
      and(
        eq(schema.finalDocuments.fesStatus, "completed"),
        eq(schema.finalDocuments.afaStatus, "pending"),
      ),
    );
  const pendingSubmissions = pendingSubmissionsRow?.count ?? 0;

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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Agency Dashboard
        </h1>
      </header>

      {impErrorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {impErrorMsg}
        </div>
      )}

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">AfA-Übermittlungen</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {pendingSubmissions === 0
                ? "Aktuell kein Kurs zur Übermittlung bereit."
                : `${pendingSubmissions} gesiegelter ${
                    pendingSubmissions === 1 ? "Kurs wartet" : "Kurse warten"
                  } auf Übermittlung.`}
            </p>
          </div>
          <Link
            href="/agency/submissions"
            className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Öffnen
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <h2 className="text-lg font-semibold">Coach einladen</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Der Coach erhält eine E-Mail mit Link zum Passwort-Setzen.
        </p>
        <div className="mt-4">
          <InviteCoachForm />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-300 px-6 py-4">
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
                    className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
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
