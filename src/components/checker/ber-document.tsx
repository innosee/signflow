import type { CheckerInput, MassnahmeTyp } from "@/lib/checker/types";
import { formatDateDE } from "@/lib/format-date";
import {
  type Integrationsergebnis,
  integrationsergebnisVariante,
} from "@/lib/integrationsergebnis";

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

function Paragraphs({ text }: { text: string | null | undefined }) {
  // Null-sicher: das Schema führt `teilnahme/ablauf/fazit` heute als
  // `notNull().default("")`, aber eine Legacy-Bericht-Zeile von VOR dieser
  // Constraint kann `null` enthalten. Ein ungeschütztes `null.split()` würde
  // die (server-gerenderte) Print-Seite werfen lassen → Puppeteer fängt ein
  // KOMPLETT WEISSES PDF ab (kein 404, kein Login). `?? ""` macht daraus
  // sauber den Platzhalter unten.
  const paras = (text ?? "")
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
  massnahmeTyp,
  integrationsergebnis,
}: {
  input: CheckerInput;
  meta?: BerMetadata;
  branding?: BerBranding;
  /** Maßnahmentyp des Kunden — steuert die Integrationsergebnis-Variante. */
  massnahmeTyp?: MassnahmeTyp | null;
  /** Integrationsergebnis (nur EKC/ESC/EGC) — null → Block wird nicht gerendert. */
  integrationsergebnis?: Integrationsergebnis | null;
}) {
  // Header rendert NUR was via `branding` reinkommt — keine Hardcoded-
  // Fallbacks mehr (vorher Erango-Adresse/-Logo, was im Multi-Tenant-
  // Setup ein Datenleck wäre, sobald ein zweiter Tenant ein PDF rendert).
  // Ein Tenant ohne hinterlegtes Branding bekommt einen leeren Header.
  const addressLines = (branding?.address ?? "")
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
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt="Logo Bildungsträger"
            className="ber-logo-image"
          />
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
              <span
                className={`ber-checkbox${meta?.keineFehlzeiten ? " checked" : ""}`}
                aria-hidden
              />{" "}
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

      <IntegrationsergebnisBlock
        massnahmeTyp={massnahmeTyp}
        ergebnis={integrationsergebnis}
      />

      <footer className="ber-footer">
        <div className="ber-signfield">
          {/* Über der Linie: Ort + Datum (wie handschriftlich) — spiegelt die
              Signatur in der Coach-Spalte. Das Label steht darunter. */}
          <div className="ber-signabove">
            {meta?.ortDatum ? (
              <span className="ber-signabove-text">{meta.ortDatum}</span>
            ) : null}
          </div>
          <div className="ber-signlabel">Ort, Datum</div>
        </div>
        <div className="ber-signfield">
          <div className="ber-signabove">
            {meta?.coachSignatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.coachSignatureUrl}
                alt="Unterschrift Coach"
                className="ber-coach-signature"
              />
            ) : null}
          </div>
          <div className="ber-signlabel">Name Coach</div>
          {meta?.coachName ? (
            <div className="ber-signvalue">{meta.coachName}</div>
          ) : null}
        </div>
      </footer>

      <style>{berCss}</style>
    </article>
  );
}

/**
 * Integrationsergebnis-Block am Berichtsende (über der Signaturzeile).
 * Zwei Varianten je Maßnahmentyp; ESCA / fehlende Daten → rendert nichts.
 * Ja/Nein als CSS-gezeichnete Boxen (kein Unicode-Glyph — der Vercel-Chromium-
 * Font hat ☒/☐ nicht, siehe Memory pdf_no_unicode_symbols). Der aktive
 * Ja-Kasten wird grün gefüllt, der aktive Nein-Kasten dunkel.
 */
function IntegrationsergebnisBlock({
  massnahmeTyp,
  ergebnis,
}: {
  massnahmeTyp?: MassnahmeTyp | null;
  ergebnis?: Integrationsergebnis | null;
}) {
  if (!massnahmeTyp) return null;
  const variante = integrationsergebnisVariante(massnahmeTyp);
  if (!variante) return null;
  if (!ergebnis || ergebnis.erfolg === null) return null;

  const ja = ergebnis.erfolg === true;
  const label =
    variante === "vermittlung" ? "Vermittlungserfolg" : "Erfolgreiche Gründung";
  const datum = formatDateDE(ergebnis.datum);

  return (
    <section className="ber-io" aria-label="Integrationsergebnis">
      <div className="ber-io-choice">
        <span className="ber-io-label">{label}:</span>
        <span className="ber-io-option">
          <span
            className={`ber-io-box${ja ? " ja" : ""}`}
            aria-hidden
          />{" "}
          JA
        </span>
        <span className="ber-io-option">
          <span
            className={`ber-io-box${!ja ? " nein" : ""}`}
            aria-hidden
          />{" "}
          NEIN
        </span>
      </div>

      {ja && variante === "vermittlung" && (
        <p className="ber-io-sentence">
          Teilnehmer*in geht zum{" "}
          <span className="ber-io-value">{datum || "—"}</span> ein
          Beschäftigungsverhältnis mit der Firma{" "}
          <span className="ber-io-value">{ergebnis.firma || "—"}</span> ein.
        </p>
      )}
      {ja && variante === "gruendung" && (
        <p className="ber-io-sentence">
          Gründung geplant zum:{" "}
          <span className="ber-io-value">{datum || "—"}</span>
        </p>
      )}
    </section>
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
  /* Puppeteer/Print-Engines drucken Hintergrundfarben sonst nicht → die grauen
     Inhalts-Boxen (#fafafa) und die CSS-Checkbox-Füllung würden fehlen. */
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
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
  /* CSS-gezeichnet statt Unicode-Glyph (☒/☐): der headless-Chromium-Font auf
     Vercel (@sparticuz/chromium) hat die Ballot-Box-Zeichen nicht → sie kamen
     im PDF leer raus. Border + gefüllter Kern rendern font-unabhängig.
     Siehe Memory pdf_no_unicode_symbols / Stundennachweis. */
  display: inline-block;
  width: 3mm;
  height: 3mm;
  border: 0.4mm solid #18181b;
  box-sizing: border-box;
  vertical-align: -0.4mm;
  margin-right: 1.5mm;
  position: relative;
}
.ber-checkbox.checked::after {
  content: "";
  position: absolute;
  inset: 0.5mm;
  background: #18181b;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
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
  break-inside: avoid;
}
.ber-signfield {
  flex: 1;
  break-inside: avoid;
}
/* Bereich über der Linie — nimmt Ort/Datum bzw. die Signatur auf. Die Linie
   ist die untere Kante dieses Bereichs; Inhalt sitzt unten bündig darüber. */
.ber-signabove {
  min-height: 18mm;
  display: flex;
  align-items: flex-end;
  padding-bottom: 2mm;
  border-bottom: 1px solid #18181b;
}
.ber-signabove-text {
  font-size: 10pt;
}
.ber-signlabel {
  font-weight: 600;
  font-size: 8.5pt;
  margin-top: 1mm;
}
.ber-signvalue {
  font-size: 10pt;
  min-height: 6mm;
}
.ber-coach-signature {
  max-height: 16mm;
  max-width: 70mm;
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
}
.ber-io {
  margin-top: 14mm;
  break-inside: avoid;
  font-size: 10pt;
  color: #18181b;
}
.ber-io-choice {
  display: flex;
  align-items: center;
  gap: 6mm;
}
.ber-io-label {
  font-weight: 700;
}
.ber-io-option {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
}
.ber-io-box {
  /* CSS-gezeichnet statt Unicode-Glyph (☒/☐) — Ballot-Box fehlt im
     headless-Chromium-Font auf Vercel. Border + gefüllter Kern rendern
     font-unabhängig. Siehe Memory pdf_no_unicode_symbols. */
  display: inline-block;
  width: 5mm;
  height: 5mm;
  border: 0.4mm solid #52525b;
  box-sizing: border-box;
  margin-right: 1.5mm;
  vertical-align: -0.8mm;
  background: #e4e4e7;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ber-io-box.ja {
  background: #7ac943;
  border-color: #5fa32f;
}
.ber-io-box.nein {
  background: #3f3f46;
  border-color: #27272a;
}
.ber-io-sentence {
  margin: 4mm 0 0 0;
  line-height: 1.6;
}
.ber-io-value {
  font-weight: 700;
  border-bottom: 0.3mm solid #a1a1aa;
  padding: 0 2mm;
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
