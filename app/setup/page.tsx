import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existingAgency = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "agency"))
    .limit(1);

  if (existingAgency.length > 0) redirect("/login");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-black/10 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Signflow einrichten
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Lege den ersten Agency-Account an. Dieser Schritt ist nur einmalig
            verfügbar.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
