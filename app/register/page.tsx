import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/dal";

import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Wer schon eingeloggt ist, hat keinen Grund auf der Registrierung zu sein.
  const session = await getCurrentSession();
  if (session) {
    redirect(
      session.user.role === "bildungstraeger" ? "/bildungstraeger" : "/coach",
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Als Bildungsträger registrieren
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Leg deinen eigenen Bildungsträger-Account an und lade danach deine
            Coaches ein. Teilnehmer brauchen keinen Account — sie bestätigen per
            Link.
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
