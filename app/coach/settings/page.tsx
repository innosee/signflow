import Link from "next/link";
import { eq } from "drizzle-orm";

import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  BillingPlaceholder,
  SettingsSection,
} from "@/components/settings/section";
import { db, schema } from "@/db";
import { requireCoach } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function CoachSettingsPage() {
  const session = await requireCoach();

  const [row] = await db
    .select({ signatureUrl: schema.users.signatureUrl })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  const signatureUrl = row?.signatureUrl ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Einstellungen
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Verwalte dein Profil, dein Passwort und deine Unterschrift.
        </p>
      </header>

      <SettingsSection
        title="Profil"
        description="Wie dein Name in BER-PDFs und im Stundennachweis erscheint."
      >
        <ProfileForm
          initialName={session.user.name}
          email={session.user.email}
        />
      </SettingsSection>

      <SettingsSection
        title="Passwort"
        description="Andere aktive Sitzungen werden beim Ändern automatisch abgemeldet."
      >
        <PasswordForm />
      </SettingsSection>

      <SettingsSection
        title="Unterschrift"
        description="Deine Unterschrift erscheint im PDF-Footer von BER-Berichten und auf signierten Stundennachweisen."
      >
        {signatureUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-lg border border-zinc-300 bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Aktuelle Unterschrift"
                className="h-16 w-auto max-w-55 rounded border border-zinc-200 bg-white"
              />
              <div className="flex-1 text-xs text-zinc-500">
                Wird beim BER-Export automatisch in den Footer eingesetzt.
              </div>
            </div>
            <Link
              href="/coach/signature"
              className="inline-block rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Unterschrift erneuern
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Du hast noch keine Unterschrift hinterlegt. Beim BER-Export wird
              dann nur dein Name eingesetzt — keine handschriftliche Signatur.
            </p>
            <Link
              href="/coach/signature"
              className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Unterschrift jetzt hinterlegen
            </Link>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Abrechnung"
        description="Pläne, Rechnungen und Zahlungsmethode."
        comingSoon
      >
        <BillingPlaceholder />
      </SettingsSection>
    </div>
  );
}
