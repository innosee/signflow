import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/dal";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === "agency" ? "/agency" : "/coach");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Agency und Coaches melden sich hier mit E-Mail und Passwort an.
            Teilnehmer erhalten einen Link per E-Mail.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
