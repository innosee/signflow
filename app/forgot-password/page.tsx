import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/dal";

import { ForgotPasswordForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.user.role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Passwort vergessen
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum
            Zurücksetzen.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="text-sm text-zinc-600">
          <Link href="/login" className="underline underline-offset-2 hover:text-black">
            Zurück zum Login
          </Link>
        </p>
      </div>
    </div>
  );
}
