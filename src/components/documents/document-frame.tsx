import type { ReactNode } from "react";

/**
 * Gemeinsamer erango-Rahmen für alle Kunde-Dokument-Vorlagen: Briefkopf
 * (Adresse + Logo), Titel mit Pfeil, Fußzeile (Formularnummer + Stand + Seite)
 * und die Signatur-Bausteine. HTML-as-Source-of-Truth — dieselbe Komponente
 * rendert Screen (interaktive Vorschau) und Print (Puppeteer → A4-PDF).
 *
 * Der Briefkopf-Text ist erango-spezifisch (die Formulare sind erango-Formulare)
 * und deshalb bewusst statisch. Das Logo kommt aus dem Tenant-Branding mit
 * „erango"-Text-Fallback.
 */

// erango-Absender (fester Bestandteil der Formulare F08/F21).
const ERANGO_ADDRESS = [
  "Scheffelstraße 28",
  "D-78224 Singen",
  "Tel. +49 (0) 7731 / 90 97 18 - 10",
  "avgs@erango.de",
  "www.erango.de",
];

type FrameProps = {
  formNumber: string;
  /** Stand-Datum wie auf dem Original gedruckt, z.B. "25.06.2025". */
  revision: string;
  title: string;
  subtitle?: string;
  logoUrl: string | null;
  children: ReactNode;
};

export function DocumentFrame({
  formNumber,
  revision,
  title,
  subtitle,
  logoUrl,
  children,
}: FrameProps) {
  return (
    <>
      <style>{documentCss}</style>
      <article className="doc" lang="de">
        <header className="doc-head">
          <address className="doc-address">
            {ERANGO_ADDRESS.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
          <div className="doc-logo">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="erango" className="doc-logo-img" />
            ) : (
              <div className="doc-logo-fallback">
                er—
                <br />
                an
                <br />
                go.
              </div>
            )}
          </div>
        </header>

        <div className="doc-title-row">
          <h1 className="doc-title">
            <span className="doc-arrow" aria-hidden="true">
              →
            </span>
            {title}
          </h1>
          {subtitle ? <p className="doc-subtitle">{subtitle}</p> : null}
        </div>

        <div className="doc-body">{children}</div>

        <footer className="doc-foot">
          <span>{formNumber}</span>
          <span>{revision}</span>
        </footer>
      </article>
    </>
  );
}

/**
 * Feld mit Beschriftung + (evtl. leerem) Wert — der visuelle Standard der
 * erango-Formulare (grau hinterlegte Eingabefläche). Leere Werte zeigen die
 * Fläche als Blankozeile.
 */
export function DocField({
  label,
  value,
  block = false,
}: {
  label: string;
  value?: string | null;
  block?: boolean;
}) {
  return (
    <div className={block ? "doc-field doc-field-block" : "doc-field"}>
      <span className="doc-field-label">{label}</span>
      <span className="doc-field-value">{value?.trim() ? value : " "}</span>
    </div>
  );
}

/**
 * Signatur-Zeile: entweder die geleistete Signatur (Bild + „digital signiert
 * am …") oder eine leere Unterschriftslinie. Immer mit „Ort, Datum" links und
 * der Rollen-Beschriftung darunter.
 */
export function SignatureLine({
  role,
  ort,
  signature,
}: {
  role: string;
  ort: string | null;
  signature: { url: string | null; signedAt: string } | null;
}) {
  return (
    <div className="doc-sig">
      <div className="doc-sig-cells">
        <div className="doc-sig-cell">
          <div className="doc-sig-line">
            {signature ? (
              <span className="doc-sig-ortdatum">
                {ort?.trim() ? `${ort}, ` : ""}
                {formatDate(signature.signedAt)}
              </span>
            ) : null}
          </div>
          <span className="doc-sig-caption">Ort, Datum</span>
        </div>
        <div className="doc-sig-cell">
          <div className="doc-sig-line">
            {signature?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signature.url}
                alt={`Unterschrift ${role}`}
                className="doc-sig-img"
              />
            ) : null}
          </div>
          <span className="doc-sig-caption">Unterschrift {role}</span>
        </div>
      </div>
      {signature ? (
        <p className="doc-sig-note">
          Digital signiert am {formatDateTime(signature.signedAt)} · einfache
          elektronische Signatur (Zeitstempel + Audit-Protokoll)
        </p>
      ) : null}
    </div>
  );
}

/** yyyy-mm-dd oder ISO → dd.mm.yyyy. Leerer/ungültiger Input → "". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const documentCss = `
  .doc {
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #111;
    max-width: 180mm;
    margin: 0 auto;
    padding: 12mm 12mm 16mm;
    background: #fff;
    font-size: 10pt;
    line-height: 1.4;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .doc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10mm;
  }
  .doc-address {
    font-style: normal;
    font-size: 7.5pt;
    line-height: 1.5;
    color: #222;
    display: flex;
    flex-direction: column;
  }
  .doc-logo-img { max-height: 20mm; max-width: 40mm; object-fit: contain; display: block; }
  .doc-logo-fallback {
    border: 1.5pt solid #14545f;
    color: #14545f;
    font-weight: 800;
    font-size: 12pt;
    line-height: 1.05;
    padding: 2mm 3mm;
    text-align: left;
  }
  .doc-title-row { margin: 6mm 0 4mm; }
  .doc-title {
    font-size: 17pt;
    font-weight: 800;
    color: #14545f;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 2mm;
  }
  .doc-arrow { color: #14545f; font-weight: 700; }
  .doc-subtitle { margin: 1.5mm 0 0; font-size: 9.5pt; font-weight: 700; color: #333; }
  .doc-body { }
  .doc-body h2 {
    font-size: 10.5pt;
    font-weight: 700;
    margin: 4mm 0 1.5mm;
    color: #111;
  }
  .doc-body p { margin: 0 0 2mm; }
  .doc-body ul, .doc-body ol { margin: 0 0 2mm; padding-left: 5mm; }
  .doc-body ul { list-style: disc; }
  .doc-body li { margin: 0 0 1mm; }
  .doc-list-decimal { list-style: decimal; }
  .doc-small { font-size: 8.5pt; color: #333; line-height: 1.35; }
  .doc-field {
    display: grid;
    grid-template-columns: 46mm 1fr;
    align-items: end;
    gap: 3mm;
    margin: 0 0 2.5mm;
  }
  .doc-field-block { grid-template-columns: 1fr; gap: 1mm; }
  .doc-field-label { font-weight: 700; font-size: 9.5pt; }
  .doc-field-value {
    border-bottom: 0.5pt solid #999;
    background: #ededed;
    min-height: 5mm;
    padding: 1mm 2mm;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    hyphens: auto;
    -webkit-hyphens: auto;
  }
  .doc-field-block .doc-field-value { min-height: 16mm; }
  .doc-numbered { display: flex; gap: 2mm; margin: 3mm 0 1mm; align-items: baseline; }
  .doc-numbered-badge {
    background: #14545f;
    color: #fff;
    font-weight: 700;
    font-size: 8pt;
    padding: 0.3mm 1.6mm;
    border-radius: 1pt;
    flex: none;
  }
  .doc-numbered h2 { margin: 0; }
  /* Signaturen */
  .doc-sig { margin: 6mm 0 0; }
  .doc-sig-cells { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .doc-sig-line {
    min-height: 15mm;
    border-bottom: 0.5pt solid #111;
    display: flex;
    align-items: flex-end;
    padding-bottom: 0.5mm;
  }
  .doc-sig-img {
    max-height: 14mm;
    max-width: 100%;
    object-fit: contain;
    image-rendering: -webkit-optimize-contrast;
  }
  .doc-sig-ortdatum { font-size: 9pt; }
  .doc-sig-caption { display: block; font-size: 8.5pt; color: #333; margin-top: 1mm; }
  .doc-sig-note { font-size: 7.5pt; color: #555; margin: 1.5mm 0 0; }
  .doc-foot {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #555;
    border-top: 0.5pt solid #ccc;
    margin-top: 8mm;
    padding-top: 2mm;
  }
  @media print {
    .doc { max-width: none; margin: 0; padding: 0; }
    .doc-foot { position: fixed; bottom: 0; left: 0; right: 0; }
  }
`;
