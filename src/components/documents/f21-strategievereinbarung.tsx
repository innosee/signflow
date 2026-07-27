import {
  DocField,
  DocumentFrame,
  SignatureLine,
} from "@/components/documents/document-frame";
import type { DocumentSheetData } from "@/components/documents/types";
import { participantDisplayName } from "@/components/documents/util";

const ARBEITSWEISE_LABEL: Record<string, string> = {
  online: "Online",
  praesenz: "Präsenz",
  hybrid: "Hybrid",
};

/**
 * F 21 — Strategievereinbarung. Frei ausgefüllte Ziel-/Arbeitsvereinbarung +
 * zwei Unterschriften (Reihenfolge egal).
 */
export function F21Strategievereinbarung({
  data,
}: {
  data: DocumentSheetData;
}) {
  const f = data.formData;
  const arbeitsweise = ARBEITSWEISE_LABEL[f.arbeitsweise ?? ""] ?? f.arbeitsweise ?? "";

  return (
    <DocumentFrame
      formNumber="F 21"
      revision="25.06.2025"
      title="Strategievereinbarung"
      logoUrl={data.branding.logoUrl}
    >
      <DocField
        label="Name, Vorname (Teilnehmer:in):"
        value={participantDisplayName(data.participant)}
      />

      <DocField label="Eckdaten des Teilnehmers" value={f.eckdaten} block />
      <p className="doc-small" style={{ marginTop: "-1mm" }}>
        Kurze Beschreibung (Studium, Ausbildung, Erfahrungen, Kenntnisse,
        Fähigkeiten und Interessen zu Beginn der Zusammenarbeit).
      </p>

      <DocField
        label="Unsere individuellen Ziele / Bewilligungsinhalte"
        value={f.ziele}
        block
      />

      <div className="doc-field" style={{ marginTop: "2mm" }}>
        <span className="doc-field-label">Unsere Arbeitsweise:</span>
        <span className="doc-field-value">{arbeitsweise || " "}</span>
      </div>

      <div className="doc-small">
        <h2>Unser Ablauf</h2>
        <p>
          Unser AVGS-Einzelcoaching findet an min. zwei Terminen wöchentlich
          statt. Unsere Termine werden im Voraus geplant. Für jeden
          Krankheitsausfall muss ab dem ersten Krankheitstag die Information der
          Abrufbarkeit der elektronischen Arbeitsunfähigkeitsbescheinigung an den
          Bedarfsträger (z. B. Agentur für Arbeit / Jobcenter) über die e-Services
          sowie eine schriftliche Entschuldigung an den Coach gesendet werden. Für
          jeden vom Teilnehmenden abgesagten Termin werden die geplanten
          Unterrichtseinheiten vollumfänglich abgerechnet. Ortsabwesenheit (z. B.
          Urlaub) ist vorab mit der Agentur für Arbeit / dem Jobcenter abzuklären
          und zu bewilligen; ausgefallene Termine müssen im bewilligten Zeitraum
          nachgeholt werden.
        </p>
      </div>

      <DocField
        label="Bereits bekannte Abwesenheitszeiten"
        value={f.abwesenheitszeiten}
        block
      />

      <div className="doc-small">
        <h2>Vertraulichkeit</h2>
        <p>
          Alle im Coaching besprochenen Themen und Informationen werden absolut
          vertraulich behandelt. Der Abschlussbericht und ggf. Gepedu-
          Testergebnisse werden an den Bedarfsträger übermittelt und bei Wunsch
          vorab zwischen Coach und Teilnehmenden besprochen.
        </p>
        <h2>Evaluation und Anpassung</h2>
        <p>
          In regelmäßigen Abständen werden Fortschritte und Wirksamkeit des
          Coachings überprüft und ggf. angepasst. Darüber hinaus werden Sie sechs
          Wochen und sechs Monate nach Ende Ihres Einzelcoachings von erango
          kontaktiert, um Ihren Ist-Status (z. B. in Arbeit, Weiterbildung) zu
          erfragen.
        </p>
      </div>

      <SignatureLine
        role="Teilnehmer:in"
        ort={f.ort}
        signature={data.signatures.participant}
      />
      <SignatureLine
        role="Coach"
        ort={f.ort}
        signature={data.signatures.coach}
      />
    </DocumentFrame>
  );
}
