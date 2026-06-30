import Link from "next/link";

import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

type Props = {
  // `error` setzt Better Auth, wenn der Link abgelaufen/ungültig ist (dann KEIN
  // `token`) — siehe `?error=INVALID_TOKEN`-Redirect im Reset-Flow.
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Passwort festlegen
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Wähle ein sicheres Passwort (mindestens 8 Zeichen).
          </p>
        </div>

        {!token ? (
          // Kein gültiger Token (Link abgelaufen, ungültig oder direkt
          // aufgerufen). Statt Sackgasse: klar erklären + Weg zum neuen Link.
          // Häufigster Fall ist ein abgelaufener Onboarding-Link.
          <div className="space-y-4">
            <p className="text-sm text-red-700">
              Dieser Link ist <strong>abgelaufen oder ungültig</strong>.
              Passwort-Links gelten aus Sicherheitsgründen nur eine begrenzte
              Zeit.
            </p>
            <p className="text-sm text-zinc-600">
              Fordere einfach einen neuen Link an — wir schicken ihn an deine
              E-Mail-Adresse.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Neuen Link anfordern
            </Link>
          </div>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </div>
  );
}
