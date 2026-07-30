import { F08Teilnehmervertrag } from "@/components/documents/f08-teilnehmervertrag";
import { F21Strategievereinbarung } from "@/components/documents/f21-strategievereinbarung";
import type { DocumentSheetData } from "@/components/documents/types";

/**
 * Wählt die passende erango-Vorlage anhand des Dokumenttyps. HTML-as-Source-of-
 * Truth: dieselbe Komponente rendert die interaktive Coach-/Teilnehmer-Vorschau
 * und — im Print-Modus via Puppeteer — das A4-PDF.
 */
export function DocumentSheet({ data }: { data: DocumentSheetData }) {
  switch (data.type) {
    case "f08_tnv":
      return <F08Teilnehmervertrag data={data} />;
    case "f21_stv":
      return <F21Strategievereinbarung data={data} />;
  }
}
