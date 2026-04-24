import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/dal";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ reset?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
  }

  const { reset } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Bildungsträger und Coaches melden sich hier mit E-Mail und Passwort an.
            Teilnehmer erhalten einen Link per E-Mail.
          </p>
        </div>
        {reset === "1" && (
          <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            Passwort wurde gesetzt. Du kannst dich jetzt anmelden.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
