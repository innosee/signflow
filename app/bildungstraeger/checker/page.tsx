import { requireBildungstraeger } from "@/lib/dal";

import { BtCheckerForm } from "./bt-checker-form";

export const dynamic = "force-dynamic";

export default async function BtCheckerPage() {
  const session = await requireBildungstraeger();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bericht prüfen
        </h1>
        <p className="text-sm text-zinc-600">
          Pastete einen TN-Abschlussbericht hier rein — der Checker findet
          Regelverstöße und fehlende Pflichtbausteine, du bekommst das
          Feedback im versandfertigen E-Mail-Format zurück.
        </p>
      </header>

      <BtCheckerForm btName={session.user.name} userId={session.user.id} />
    </div>
  );
}
