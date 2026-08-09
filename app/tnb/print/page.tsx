import { notFound } from "next/navigation";

import { TnbTeilnahmebescheinigung } from "@/components/documents/tnb-teilnahmebescheinigung";
import { hasTnbAccess } from "@/lib/documents/tnb-access";
import { loadTnbErangoAssets } from "@/lib/documents/tnb-erango-assets";
import { buildTnbSheetData, decodeTnbParams } from "@/lib/documents/tnb-public";

/**
 * Öffentliche Print-Seite der /tnb-Mini-App — genau die HTML-Quelle, aus der
 * Puppeteer das A4-PDF rendert (HTML-as-Source-of-Truth). Login-frei; die
 * Eingaben kommen komplett aus der Query. Keine DB-Schreibzugriffe — nur das
 * feste erango-Branding/-Signatur wird serverseitig aufgelöst.
 */

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TnbPrintPage({ searchParams }: Props) {
  // Gate spiegelt die /tnb-Seite (der Cookie wird vom PDF-Renderer weitergereicht).
  if (!(await hasTnbAccess())) notFound();

  const input = decodeTnbParams(await searchParams);
  const assets = await loadTnbErangoAssets();
  const data = buildTnbSheetData(input, assets);

  return <TnbTeilnahmebescheinigung data={data} />;
}
