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
 * F 21 — Strategievereinbarung (Stand 2026). Frei ausgefüllte Ziel-/
 * Arbeitsvereinbarung + zwei Unterschriften (Reihenfolge egal; zweite Zeile =
 * Coach).
 */
export function F21Strategievereinbarung({
  data,
}: {
  data: DocumentSheetData;
}) {
  const f = data.formData;
  const arbeitsweise =
    ARBEITSWEISE_LABEL[f.arbeitsweise ?? ""] ?? f.arbeitsweise ?? "";

  return (
    <DocumentFrame
      formNumber="F 21"
      revision="25.06.2026"
      title="Strategievereinbarung"
      logoUrl={data.branding.logoUrl}
    >
      <DocField
        label="Name, Vorname (Teilnehmer:in):"
        value={participantDisplayName(data.participant)}
      />

      <DocField label="Eckdaten des Teilnehmers" value={f.eckdaten} block />
      <p className="doc-small" style={{ marginTop: "-1mm" }}>
        Kurze Beschreibung (Studium, Ausbildung, Erfahrungen (in 1–2 Sätzen),
        Kenntnisse, Fähigkeiten und Interessen zu Beginn der Zusammenarbeit).
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
          Damit Ihr Coaching reibungslos verläuft und wir Ihre Ziele optimal
          erreichen können, vereinbaren wir gemeinsam folgendes:
        </p>
        <ul>
          <li>
            <strong>Regelmäßige Termine:</strong> Ihr AVGS-Einzelcoaching lebt
            von Kontinuität. Wir treffen uns daher mindestens zweimal pro Woche
            (Ausnahmefälle sind individuell vorab zu klären). Die Termine planen
            wir immer im Voraus.
          </li>
          <li>
            <strong>Was passiert im Krankheitsfall?</strong> Falls Sie krank
            werden, informieren Sie bitte ab dem ersten Tag Ihre Agentur für
            Arbeit bzw. Ihr Jobcenter (am schnellsten geht das online über die
            e-Services) und teilen Sie dort mit, dass Ihre elektronische
            Arbeitsunfähigkeitsbescheinigung (eAU) abrufbar ist. Schicken Sie
            außerdem eine kurze schriftliche Entschuldigung per E-Mail an Ihren
            Coach.
          </li>
          <li>
            <strong>Kurzfristige Absagen:</strong> Wir reservieren die
            Coaching-Zeit exklusiv für Sie. Wenn Sie einen Termin kurzfristig
            absagen (weniger als 24 Stunden vorher oder am Wochenende/Feiertag
            für den darauffolgenden Werktag), müssen wir die geplanten
            Unterrichtseinheiten leider voll abrechnen.
          </li>
          <li>
            <strong>Urlaub und Ortsabwesenheit:</strong> Planen Sie während des
            Coachings eine Reise oder sind Sie aus anderen Gründen nicht vor Ort,
            besprechen Sie dies bitte so früh wie möglich mit uns. Wichtig ist:
            Jede Ortsabwesenheit muss vorab von der Agentur für Arbeit oder dem
            Jobcenter genehmigt werden. Bitte legen Sie Ihrem Coach diese
            Bewilligung vor, bevor Sie abreisen. Die Termine, die in diese Zeit
            fallen, holen wir einfach nach.
          </li>
        </ul>
      </div>

      <DocField
        label="Bereits bekannte Abwesenheitszeiten"
        value={f.abwesenheitszeiten}
        block
      />

      <div className="doc-small">
        <h2>Vertraulichkeit und Datenschutz</h2>
        <p>
          <strong>Absolute Diskretion:</strong> Alles, was Sie im Coaching mit
          Ihrem Coach besprechen, bleibt unter uns und wird absolut vertraulich
          behandelt.
        </p>
        <p>
          <strong>Berichte & Testergebnisse:</strong> Da Ihr Einzelcoaching
          durch die Agentur für Arbeit oder das Jobcenter gefördert wird, sind
          wir verpflichtet, einen abschließenden Bericht (und falls durchgeführt,
          die Ergebnisse des Gepedu-Tests) dorthin zu übermitteln. Transparenz
          ist uns wichtig: Wenn Sie es wünschen, gehen wir diesen
          Abschlussbericht vor der Weiterleitung sehr gerne gemeinsam mit Ihnen
          durch.
        </p>
        <p>
          <strong>Evaluation und Anpassung:</strong> In regelmäßigen Abständen
          werden Fortschritte und Wirksamkeit des Coachings überprüft und ggf.
          angepasst, um sicherzustellen, dass die Ziele des Teilnehmenden
          erreicht werden. Darüber hinaus werden Sie sechs Wochen und sechs
          Monate nach Ende Ihres Einzelcoachings von erango kontaktiert, um Ihren
          Ist-Status (z. B. in Arbeit, Weiterbildung etc.) zu erfragen.
        </p>
      </div>

      <SignatureLine
        role="Teilnehmer:in"
        ort={f.ort}
        signature={data.signatures.participant}
      />
      <SignatureLine role="Coach" ort={f.ort} signature={data.signatures.coach} />
    </DocumentFrame>
  );
}
