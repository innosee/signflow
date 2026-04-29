import type { CheckerInput } from "@/lib/checker/types";

type BerMetadata = {
  avgsMassnahme?: string;
  teilnehmerName?: string;
  kundenNr?: string;
  zeitraum?: string;
  coachName?: string;
  gesamtzahlUe?: string;
  /**
   * "Ort, Datum"-Eintrag im Footer. Wird für kurs-gebundene BERs
   * automatisch aus `courses.durchfuehrungsort` + `submitted_at` befüllt;
   * bei Schnell-Check-Submissions bleibt er leer und der Coach trägt
   * ihn handschriftlich nach.
   */
  ortDatum?: string;
  /** Optionaler Signatur-Bild-URL des Coaches (PNG, transparenter Hintergrund). */
  coachSignatureUrl?: string | null;
  /** Markierung "Keine Fehlzeiten" → Pille im Header. */
  keineFehlzeiten?: boolean;
  /**
   * Optionales Freitextfeld für AVGS-Inhalte. Wenn nicht leer, wird unter
   * den drei Standard-Sektionen eine 4. "Sonstiges"-Sektion gerendert.
   */
  sonstiges?: string;
  /**
   * Begründung des Coaches, warum bestimmte Pflicht-Bausteine in dieser
   * AVGS nicht abgedeckt sind (z.B. 5-UE-Bewerbungsoptimierung). Wird
   * unauffällig unter dem Footer als Anmerkung gerendert — Audit-Trail.
   */
  mustHaveOverrideReason?: string | null;
};

type BerBranding = {
  /** Logo-URL des Bildungsträgers; wenn null → Text-Fallback im Header-Block. */
  logoUrl?: string | null;
  /** Postadresse (mehrzeilig, `\n`-separiert). */
  address?: string;
};

const DEFAULT_ADDRESS_LINES = [
  "Ekkehardstraße 12b",
  "D-78224 Singen",
  "Tel. +49 (0) 7731 / 90 97 18 - 10",
  "Fax +49 (0) 7731 / 90 97 18 - 11",
  "avgs@erango.de",
  "www.erango.de",
];

const SECTION_TITLES = [
  {
    id: "teilnahme" as const,
    title: "Teilnahme und Mitarbeit / persönliche Interessen und Stärken",
    hint: "(z.B. Motivation, Ausdauer, Selbstorganisation, Unternehmerpersönlichkeit)",
  },
  {
    id: "ablauf" as const,
    title: "Ablauf, Inhalte des Coachings / erarbeitete Konzepte und Strategien",
    hint: null,
  },
  {
    id: "fazit" as const,
    title: "Fazit, Ergebnisse, Empfehlungen, Gründungsperspektive",
    hint: null,
  },
];

function Paragraphs({ text }: { text: string }) {
  // `(?:\r?\n){2,}` matched sowohl Unix- als auch Windows-Zeilenenden;
  // der Alt-Ausdruck `\r\n{2,}` hätte CRLF-Absätze nicht korrekt erkannt.
  const paras = text
    .split(/(?:\r?\n){2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paras.length === 0) {
    return (
      <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
        — kein Text eingegeben —
      </span>
    );
  }

  return (
    <>
      {paras.map((p, idx) => (
        <p key={idx} className="ber-para">
          {p.split(/\n/).map((line, li, arr) => (
            <span key={li}>
              {line}
              {li < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

export function BerDocument({
  input,
  meta,
  branding,
}: {
  input: CheckerInput;
  meta?: BerMetadata;
  branding?: BerBranding;
}) {
  const addressLines = (branding?.address && branding.address.trim().length > 0
    ? branding.address
    : DEFAULT_ADDRESS_LINES.join("\n"))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <article className="ber-document" aria-label="TN-bezogener Bericht">
      <header className="ber-header">
        <address className="ber-address">
          {addressLines.map((line, idx) => (
            <span key={idx} className="ber-address-line">
              {line}
            </span>
          ))}
        </address>
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt="Logo Bildungsträger"
            className="ber-logo-image"
          />
        ) : (
          <div className="ber-logo" aria-hidden>
            er—
            <br />
            -an
            <br />
            go.
          </div>
        )}
      </header>

      <h1 className="ber-title">→ TN-bezogener Bericht</h1>

      <table className="ber-meta">
        <tbody>
          <MetaRow label="AVGS-Maßnahme" value={meta?.avgsMassnahme} />
          <MetaRow label="Teilnehmer*in" value={meta?.teilnehmerName} />
          <MetaRow label="Kunden-Nr." value={meta?.kundenNr} />
          <MetaRow label="Zeitraum" value={meta?.zeitraum} />
          <MetaRow label="Coach" value={meta?.coachName} />
          <MetaRow label="Gesamtzahl UE" value={meta?.gesamtzahlUe} />
          <tr>
            <th scope="row">Fehlzeiten:</th>
            <td>
              <span className="ber-checkbox" aria-hidden>
                {meta?.keineFehlzeiten ? "☒" : "☐"}
              </span>{" "}
              keine Fehlzeiten
            </td>
          </tr>
        </tbody>
      </table>

      {SECTION_TITLES.map((section) => (
        <section key={section.id} className="ber-section">
          <h2 className="ber-section-title">
            {section.title}
            {section.hint && (
              <span className="ber-section-hint"> {section.hint}</span>
            )}
            :
          </h2>
          <div className="ber-content-box">
            <Paragraphs text={input[section.id]} />
          </div>
        </section>
      ))}

      {meta?.sonstiges && meta.sonstiges.trim().length > 0 && (
        <section className="ber-section">
          <h2 className="ber-section-title">
            Sonstige AVGS-Inhalte
            <span className="ber-section-hint">
              {" "}
              (z.B. GEPEDU-Test, Anerkennung ausländischer Diplome,
              Tragfähigkeitsanalyse)
            </span>
            :
          </h2>
          <div className="ber-content-box">
            <Paragraphs text={meta.sonstiges} />
          </div>
        </section>
      )}

      {meta?.mustHaveOverrideReason &&
        meta.mustHaveOverrideReason.trim().length > 0 && (
          <section className="ber-override-note" aria-label="Anmerkung des Coaches">
            <span className="ber-override-label">
              Anmerkung zur Pflicht-Baustein-Abdeckung:
            </span>{" "}
            {meta.mustHaveOverrideReason}
          </section>
        )}

      <footer className="ber-footer">
        <div className="ber-signfield">
          <div className="ber-signlabel">Ort, Datum</div>
          <div className="ber-signvalue">{meta?.ortDatum ?? ""}</div>
        </div>
        <div className="ber-signfield">
          {meta?.coachSignatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meta.coachSignatureUrl}
              alt="Unterschrift Coach"
              className="ber-coach-signature"
            />
          ) : null}
          <div className="ber-signlabel">Name Coach</div>
          <div className="ber-signvalue">{meta?.coachName ?? ""}</div>
        </div>
      </footer>

      <style>{berCss}</style>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  return (
    <tr>
      <th scope="row">{label}:</th>
      <td>{value ?? ""}</td>
    </tr>
  );
}

const berCss = `
.ber-document {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #18181b;
  background: white;
  max-width: 190mm;
  margin: 0 auto;
  padding: 15mm 15mm 18mm 15mm;
  font-size: 10pt;
  line-height: 1.45;
}
.ber-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10mm;
  margin-bottom: 10mm;
}
.ber-address {
  font-style: normal;
  font-size: 8.5pt;
  line-height: 1.5;
  color: #3f3f46;
  display: flex;
  flex-direction: column;
}
.ber-address-line {
  display: block;
}
.ber-logo {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  font-size: 11pt;
  line-height: 1.05;
  letter-spacing: -0.5px;
  padding: 4mm 5mm;
  border: 1.2px solid #18181b;
  color: #18181b;
  text-align: left;
  min-width: 16mm;
}
.ber-logo-image {
  max-height: 22mm;
  max-width: 50mm;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.ber-title {
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 4mm 0 8mm 0;
  color: #18181b;
}
.ber-meta {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10mm;
  font-size: 9.5pt;
}
.ber-meta th {
  text-align: left;
  font-weight: 600;
  padding: 2mm 3mm;
  background: #f4f4f5;
  border: 1px solid #e4e4e7;
  width: 40mm;
  color: #27272a;
}
.ber-meta td {
  padding: 2mm 3mm;
  border: 1px solid #e4e4e7;
  background: #fafafa;
  color: #18181b;
}
.ber-checkbox {
  display: inline-block;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 11pt;
  line-height: 1;
  vertical-align: middle;
  margin-right: 1.5mm;
}
.ber-override-note {
  margin: -2mm 0 6mm 0;
  padding: 3mm 4mm;
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  font-size: 9pt;
  color: #78350f;
  break-inside: avoid-page;
}
.ber-override-label {
  font-weight: 600;
}
.ber-section {
  margin-bottom: 8mm;
  break-inside: avoid-page;
}
.ber-section-title {
  font-size: 9.5pt;
  font-weight: 700;
  margin: 0 0 2mm 0;
  color: #18181b;
}
.ber-section-hint {
  font-weight: 400;
  font-style: italic;
  color: #52525b;
}
.ber-content-box {
  background: #e6e8ea;
  padding: 4mm 5mm;
  border-radius: 0;
  font-size: 9.5pt;
  color: #18181b;
  min-height: 25mm;
}
.ber-para {
  margin: 0 0 3mm 0;
}
.ber-para:last-child {
  margin-bottom: 0;
}
.ber-footer {
  display: flex;
  gap: 10mm;
  margin-top: 20mm;
  font-size: 9pt;
  color: #27272a;
}
.ber-signfield {
  flex: 1;
  border-top: 1px solid #18181b;
  padding-top: 2mm;
  position: relative;
}
.ber-signlabel {
  font-weight: 600;
  font-size: 8.5pt;
  margin-bottom: 1mm;
}
.ber-signvalue {
  font-size: 10pt;
  min-height: 6mm;
}
.ber-coach-signature {
  position: absolute;
  bottom: calc(100% - 2mm);
  left: 0;
  max-height: 18mm;
  max-width: 70mm;
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
}
@media print {
  @page {
    size: A4;
    margin: 12mm 12mm 15mm 12mm;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: white;
  }
  .ber-document {
    max-width: none;
    margin: 0;
    padding: 0;
  }
}
`;
