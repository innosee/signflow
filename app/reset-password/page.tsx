import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, error } = await searchParams;

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

        {error === "INVALID_TOKEN" && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Der Einladungslink ist ungültig oder abgelaufen. Bitte fordere eine
            neue Einladung bei deiner Agentur an.
          </p>
        )}

        {!token ? (
          <p className="text-sm text-red-600">
            Es wurde kein Token übergeben. Öffne bitte den Link aus deiner
            Einladungs-E-Mail.
          </p>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </div>
  );
}
