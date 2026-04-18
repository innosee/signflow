import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentSession } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === "agency" ? "/agency" : "/coach");
  }

  const hasAgency = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "agency"))
    .limit(1);

  if (hasAgency.length === 0) redirect("/setup");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Signflow</h1>
        <p className="text-zinc-600">
          Digitale Anwesenheitsnachweise für Coaches und Kursteilnehmer.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Anmelden
        </Link>
      </div>
    </div>
  );
}
