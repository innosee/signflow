import Link from "next/link";
import { eq } from "drizzle-orm";

import { BrandingForm } from "@/components/settings/branding-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  BillingPlaceholder,
  SettingsSection,
} from "@/components/settings/section";
import { db, schema } from "@/db";
import { getBranding } from "@/lib/branding";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { getTenantSwitcherData } from "@/lib/memberships";
import { resolveAssetUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function BildungstraegerSettingsPage() {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const branding = await getBranding(tenantId);
  const initialAddress = branding.address;
  const { activeTenantName } = await getTenantSwitcherData(
    session.user.id,
    tenantId,
  );

  const [tenantRow] = await db
    .select({ signatureUrl: schema.tenants.signatureUrl })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  const signatureUrl = await resolveAssetUrl(tenantRow?.signatureUrl);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Einstellungen
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Verwalte dein Profil, dein Passwort, das PDF-Branding, die
          Unterschrift und die Abrechnung.
        </p>
      </header>

      <SettingsSection
        title="Profil"
        description="Bildungsträger, Ansprechpartner und E-Mail wie sie im System und in System-E-Mails erscheinen."
      >
        <ProfileForm
          tenantName={activeTenantName}
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
        title="PDF-Branding"
        description="Logo und Postanschrift, die im Header jedes BER-PDFs gerendert werden. Greift auch für PDFs, die deine Coaches exportieren."
      >
        <BrandingForm
          initialAddress={initialAddress}
          initialLogoUrl={branding.logoUrl}
        />
      </SettingsSection>

      <SettingsSection
        title="Unterschrift"
        description="Organisationsweite Bildungsträger-Unterschrift — erscheint als zweite Signaturzeile auf den Bildungsträger-Dokumenten. Bereits unterschriebene Dokumente behalten die alte Unterschrift."
      >
        {signatureUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-lg border border-zinc-300 bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Aktuelle Bildungsträger-Unterschrift"
                className="h-16 w-auto max-w-55 rounded border border-zinc-200 bg-white"
              />
              <div className="flex-1 text-xs text-zinc-500">
                Wird auf Bildungsträger-Dokumenten automatisch eingesetzt.
              </div>
            </div>
            <Link
              href="/bildungstraeger/signature?returnTo=/bildungstraeger/settings"
              className="inline-block rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Unterschrift erneuern
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Für diese Organisation ist noch keine Unterschrift hinterlegt. Auf
              Bildungsträger-Dokumenten fehlt dann die handschriftliche Signatur.
            </p>
            <Link
              href="/bildungstraeger/signature?returnTo=/bildungstraeger/settings"
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
