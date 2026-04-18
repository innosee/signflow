import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string }>;
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
