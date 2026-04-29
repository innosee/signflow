import { BrandingForm } from "@/components/settings/branding-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  BillingPlaceholder,
  SettingsSection,
} from "@/components/settings/section";
import { DEFAULT_BRANDING, getBranding } from "@/lib/branding";
import { requireBildungstraeger } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function BildungstraegerSettingsPage() {
  const session = await requireBildungstraeger();
  const branding = await getBranding();

  // Im Branding-Form zeigen wir den Default-Block, wenn der BT noch keine
  // eigene Adresse hinterlegt hat — sonst wäre das Textarea leer und der
  // BT müsste die Erango-Werte mühsam abtippen.
  const initialAddress =
    branding.address === DEFAULT_BRANDING.address
      ? branding.address
      : branding.address;

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
        description="Wie dein Name im System und in System-E-Mails erscheint."
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
