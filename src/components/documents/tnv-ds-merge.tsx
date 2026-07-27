import { DocumentFrame, SignatureLine } from "@/components/documents/document-frame";
import { F04Body } from "@/components/documents/f04-datenschutz";
import { F08Body } from "@/components/documents/f08-teilnehmervertrag";
import type { DocumentSheetData } from "@/components/documents/types";

/**
 * Kombiniertes Dokument: Teilnehmervertrag (F 08) + Datenschutzerklärung (F 04)
 * in einem, mit **einer** Teilnehmer-Unterschrift am Ende. Nutzt die Rümpfe der
 * beiden Einzel-Vorlagen (kein duplizierter Rechtstext).
 */
export function TnvDsMerge({ data }: { data: DocumentSheetData }) {
  return (
    <DocumentFrame
      formNumber="F 08 + F 04"
      revision="25.06.2025"
      title="Teilnehmervertrag & Datenschutzerklärung"
      logoUrl={data.branding.logoUrl}
    >
      <F08Body data={data} />

      <div style={{ breakBefore: "page", marginTop: "8mm" }}>
        <h2 style={{ fontSize: "13pt", color: "#14545f", marginBottom: "2mm" }}>
          Datenschutzerklärung
        </h2>
        <p className="doc-small" style={{ fontWeight: 700, marginBottom: "3mm" }}>
          Datenschutzhinweise nach Art. 13/14 DSGVO für Teilnehmer:innen von
          AVGS-Einzelcoachings (§ 45 SGB III, Nr. 1, 4, 5)
        </p>
        <F04Body />
      </div>

      <p className="doc-small" style={{ marginTop: "4mm" }}>
        Mit meiner Unterschrift bestätige ich den Teilnehmervertrag und die
        Kenntnisnahme der Datenschutzerklärung.
      </p>
      <SignatureLine
        role="Teilnehmer:in"
        ort={data.formData.ort}
        signature={data.signatures.participant}
      />
      <SignatureLine
        role="erango Mitarbeiter:in"
        ort={data.formData.ort}
        signature={data.signatures.coach}
      />
    </DocumentFrame>
  );
}
