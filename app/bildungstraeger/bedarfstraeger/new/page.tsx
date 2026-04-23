import { requireBildungstraeger } from "@/lib/dal";

import { BedarfstraegerForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewBedarfstraegerPage() {
  await requireBildungstraeger();

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Neuer Bedarfsträger
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Name und Typ sind Pflicht. Adresse, Ansprechperson und E-Mail kannst
          du jetzt oder später nachtragen (relevant fürs spätere
          Rechnungsmodul).
        </p>
      </header>
      <BedarfstraegerForm />
    </div>
  );
}
