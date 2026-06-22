import { BrandingForm } from "@/components/settings/branding-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  BillingPlaceholder,
  SettingsSection,
} from "@/components/settings/section";
import { getBranding } from "@/lib/branding";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { getTenantSwitcherData } from "@/lib/memberships";

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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Einstellungen
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Verwalte dein Profil, dein Passwort, das PDF-Branding und die
          Abrechnung.
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
        title="Abrechnung"
        description="Pläne, Rechnungen und Zahlungsmethode."
        comingSoon
      >
        <BillingPlaceholder />
      </SettingsSection>
    </div>
  );
}
