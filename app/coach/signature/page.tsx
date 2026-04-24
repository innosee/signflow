import Link from "next/link";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSigningEnabled } from "@/lib/dal";

import { SignatureSetup } from "./signature-setup";

export const dynamic = "force-dynamic";

export default async function CoachSignaturePage() {
  const session = await requireSigningEnabled();

  const [row] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Deine Unterschrift
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Einmalig anlegen — wird bei jeder Session-Bestätigung wiederverwendet.
          </p>
        </div>
        <Link
          href="/coach"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          Zurück zum Dashboard
        </Link>
      </header>

      <SignatureSetup existingUrl={row?.signatureUrl ?? null} />
    </div>
  );
}
