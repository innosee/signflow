"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { TnbTeilnahmebescheinigung } from "@/components/documents/tnb-teilnahmebescheinigung";
import { MASSNAHME_TYPEN, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";
import type { MassnahmeTypCode } from "@/lib/massnahme-typ";
import {
  TNB_CUSTOM_LINES,
  TNB_KATALOGE,
  validateTnbAuswahl,
} from "@/lib/documents/tnb-katalog";
import {
  buildTnbSheetData,
  emptyTnbInput,
  encodeTnbParams,
  TNB_ANREDE_LABEL,
  type TnbAnrede,
  type TnbAssets,
  type TnbPublicInput,
} from "@/lib/documents/tnb-public";

/**
 * Client-Konfigurator: links das dynamische Formular, rechts die Live-Vorschau
 * (dieselbe Template-Komponente wie das PDF → WYSIWYG). „PDF drucken" hängt die
 * Eingaben als Query an /api/tnb/pdf.
 */
export function TnbConfigurator({ assets }: { assets: TnbAssets }) {
  const [input, setInput] = useState<TnbPublicInput>(emptyTnbInput);

  const katalog = TNB_KATALOGE[input.massnahmeTyp];
  const customLines = padCustom(input.customLines);

  const selectedCount =
    input.selectedKeys.length +
    customLines.filter((l) => l.trim()).length;
  const atMax = selectedCount >= katalog.max;

  const auswahlError = validateTnbAuswahl(input.massnahmeTyp, {
    selectedKeys: input.selectedKeys,
    customLines: input.customLines,
  });

  const missing = missingFields(input);
  const canPrint = missing.length === 0 && auswahlError == null;

  const sheet = useMemo(
    () => buildTnbSheetData(input, assets),
    [input, assets],
  );

  function patch(p: Partial<TnbPublicInput>) {
    setInput((prev) => ({ ...prev, ...p }));
  }

  function onTypChange(typ: MassnahmeTypCode) {
    // Katalog-Keys sind typ-spezifisch → beim Wechsel verwerfen (Custom bleibt).
    patch({ massnahmeTyp: typ, selectedKeys: [] });
  }

  function toggleKey(key: string) {
    setInput((prev) => {
      const has = prev.selectedKeys.includes(key);
      if (has) {
        return { ...prev, selectedKeys: prev.selectedKeys.filter((k) => k !== key) };
      }
      const total =
        prev.selectedKeys.length +
        prev.customLines.filter((l) => l.trim()).length;
      if (total >= TNB_KATALOGE[prev.massnahmeTyp].max) return prev; // Limit
      return { ...prev, selectedKeys: [...prev.selectedKeys, key] };
    });
  }

  function setCustom(i: number, value: string) {
    setInput((prev) => {
      const next = padCustom(prev.customLines).slice();
      next[i] = value;
      return { ...prev, customLines: next };
    });
  }

  function handlePrint() {
    if (!canPrint) return;
    const qs = encodeTnbParams({
      ...input,
      customLines: input.customLines.map((l) => l.trim()).filter(Boolean),
    }).toString();
    window.location.href = `/api/tnb/pdf?${qs}`;
  }

  return (
    <div className="tnb-app">
      <div className="tnb-app-grid">
        {/* -------- Formular -------- */}
        <div className="tnb-form">
          <header className="tnb-form-head">
            <h1>Teilnahmebescheinigung erstellen</h1>
            <p>
              Für Kund:innen, die (noch) nicht in Signflow angelegt sind. Felder
              ausfüllen, Inhalte anklicken, als PDF drucken. Kein Login, keine
              Speicherung.
            </p>
          </header>

          <section className="tnb-fieldset">
            <span className="tnb-legend">Anrede</span>
            <div className="tnb-radio-row">
              {(["herr", "frau"] as TnbAnrede[]).map((a) => (
                <label key={a} className="tnb-radio">
                  <input
                    type="radio"
                    name="anrede"
                    checked={input.anrede === a}
                    onChange={() => patch({ anrede: a })}
                  />
                  {TNB_ANREDE_LABEL[a]}
                </label>
              ))}
            </div>
          </section>

          <div className="tnb-row-2">
            <Field label="Vorname" required>
              <input
                value={input.vorname}
                onChange={(e) => patch({ vorname: e.target.value })}
                placeholder="Max"
              />
            </Field>
            <Field label="Nachname" required>
              <input
                value={input.nachname}
                onChange={(e) => patch({ nachname: e.target.value })}
                placeholder="Mustermann"
              />
            </Field>
          </div>

          <div className="tnb-row-2">
            <Field label="Zeitraum von" required>
              <input
                type="date"
                value={input.von}
                onChange={(e) => patch({ von: e.target.value })}
              />
            </Field>
            <Field label="bis" required>
              <input
                type="date"
                value={input.bis}
                onChange={(e) => patch({ bis: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Maßnahme" required>
            <select
              value={input.massnahmeTyp}
              onChange={(e) => onTypChange(e.target.value as MassnahmeTypCode)}
            >
              {MASSNAHME_TYPEN.map((t) => (
                <option key={t} value={t}>
                  {MASSNAHME_TYP_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          <div className="tnb-row-2">
            <Field label="Anzahl UE" required>
              <input
                inputMode="numeric"
                value={input.ue}
                onChange={(e) => patch({ ue: e.target.value })}
                placeholder="80"
              />
            </Field>
            <Field label="Ort" required>
              <input
                value={input.ort}
                onChange={(e) => patch({ ort: e.target.value })}
                placeholder="Singen"
              />
            </Field>
          </div>

          {/* -------- Inhalte-Katalog (dynamisch je Maßnahme) -------- */}
          <section className="tnb-fieldset">
            <span className="tnb-legend">
              Inhalte des Coachings{" "}
              <span className="tnb-hint">
                ({katalog.hint} — aktuell {selectedCount})
              </span>
            </span>
            {katalog.groups.map((g, gi) => (
              <div key={gi} className="tnb-group">
                {g.title ? <p className="tnb-group-title">{g.title}</p> : null}
                {g.items.map((it) => {
                  const checked = input.selectedKeys.includes(it.key);
                  return (
                    <label
                      key={it.key}
                      className={`tnb-check ${!checked && atMax ? "is-disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && atMax}
                        onChange={() => toggleKey(it.key)}
                      />
                      <span>{it.label}</span>
                    </label>
                  );
                })}
              </div>
            ))}

            <p className="tnb-group-title">Eigene Zeilen (optional)</p>
            {Array.from({ length: TNB_CUSTOM_LINES }).map((_, i) => (
              <input
                key={i}
                className="tnb-custom"
                value={customLines[i] ?? ""}
                onChange={(e) => setCustom(i, e.target.value)}
                placeholder={`Eigener Inhalt ${i + 1}`}
              />
            ))}
            {auswahlError ? (
              <p className="tnb-error">{auswahlError}</p>
            ) : null}
          </section>

          <div className="tnb-actions">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrint}
              className="tnb-btn"
            >
              PDF drucken
            </button>
            {!canPrint ? (
              <p className="tnb-note">
                {missing.length > 0
                  ? `Bitte ausfüllen: ${missing.join(", ")}.`
                  : auswahlError}
              </p>
            ) : (
              <p className="tnb-note">Öffnet die fertige Bescheinigung als PDF.</p>
            )}
          </div>
        </div>

        {/* -------- Live-Vorschau -------- */}
        <div className="tnb-preview-col">
          <p className="tnb-preview-label">Vorschau</p>
          <PreviewScaler>
            <TnbTeilnahmebescheinigung data={sheet} />
          </PreviewScaler>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="tnb-field">
      <span className="tnb-field-label">
        {label}
        {required ? <span className="tnb-req"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * Skaliert das 210mm-Blatt so herunter, dass es in die Vorschau-Spalte passt.
 * Misst die Spaltenbreite und rechnet den Scale-Faktor gegen 210mm (≈ 793px).
 */
function PreviewScaler({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const SHEET_PX = 793; // 210mm @ 96dpi
  const SHEET_H = 1122; // 297mm @ 96dpi

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setScale(Math.min(1, w / SHEET_PX));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="tnb-scaler">
      <div
        className="tnb-scaler-inner"
        style={{
          transform: `scale(${scale})`,
          height: SHEET_H * scale,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function padCustom(lines: string[]): string[] {
  const out = lines.slice(0, TNB_CUSTOM_LINES);
  while (out.length < TNB_CUSTOM_LINES) out.push("");
  return out;
}

function missingFields(input: TnbPublicInput): string[] {
  const m: string[] = [];
  if (!input.vorname.trim()) m.push("Vorname");
  if (!input.nachname.trim()) m.push("Nachname");
  if (!input.von) m.push("Zeitraum von");
  if (!input.bis) m.push("Zeitraum bis");
  if (!input.ue.trim()) m.push("Anzahl UE");
  if (!input.ort.trim()) m.push("Ort");
  return m;
}

const css = `
.tnb-app {
  min-height: 100vh;
  background: #f4f4f5;
  color: #18181b;
  padding: 24px;
  box-sizing: border-box;
}
.tnb-app-grid {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(340px, 460px) 1fr;
  gap: 28px;
  align-items: start;
}
@media (max-width: 900px) {
  .tnb-app-grid { grid-template-columns: 1fr; }
}
.tnb-form {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tnb-form-head h1 { font-size: 20px; font-weight: 700; margin: 0 0 6px 0; }
.tnb-form-head p { font-size: 13px; color: #52525b; margin: 0; line-height: 1.5; }
.tnb-field { display: flex; flex-direction: column; gap: 5px; }
.tnb-field-label { font-size: 12.5px; font-weight: 600; color: #3f3f46; }
.tnb-req { color: #dc2626; }
.tnb-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tnb-field input,
.tnb-field select,
.tnb-custom {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d4d4d8;
  border-radius: 9px;
  padding: 9px 11px;
  font-size: 14px;
  background: #fff;
  color: #18181b;
}
.tnb-field input:focus,
.tnb-field select:focus,
.tnb-custom:focus {
  outline: 2px solid #14545f;
  outline-offset: 0;
  border-color: #14545f;
}
.tnb-fieldset { display: flex; flex-direction: column; gap: 8px; }
.tnb-legend { font-size: 12.5px; font-weight: 600; color: #3f3f46; }
.tnb-hint { font-weight: 400; color: #71717a; }
.tnb-radio-row { display: flex; gap: 18px; }
.tnb-radio { display: flex; align-items: center; gap: 7px; font-size: 14px; cursor: pointer; }
.tnb-group { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
.tnb-group-title {
  font-size: 12px; font-weight: 600; color: #52525b;
  margin: 8px 0 2px 0;
}
.tnb-check {
  display: flex; align-items: flex-start; gap: 9px;
  font-size: 13.5px; line-height: 1.4; padding: 4px 6px;
  border-radius: 8px; cursor: pointer;
}
.tnb-check:hover { background: #f4f4f5; }
.tnb-check input { margin-top: 2px; flex-shrink: 0; }
.tnb-check.is-disabled { opacity: 0.45; cursor: not-allowed; }
.tnb-custom { margin-top: 4px; }
.tnb-error { color: #dc2626; font-size: 12.5px; margin: 4px 0 0 0; }
.tnb-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.tnb-btn {
  background: #14545f; color: #fff; border: none; border-radius: 10px;
  padding: 12px 18px; font-size: 15px; font-weight: 600; cursor: pointer;
  align-self: flex-start;
}
.tnb-btn:hover:enabled { background: #0f4149; }
.tnb-btn:disabled { background: #a1a1aa; cursor: not-allowed; }
.tnb-note { font-size: 12.5px; color: #71717a; margin: 0; }
.tnb-preview-col { position: sticky; top: 24px; }
.tnb-preview-label {
  font-size: 12.5px; font-weight: 600; color: #52525b; margin: 0 0 8px 4px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.tnb-scaler { width: 100%; overflow: hidden; }
.tnb-scaler-inner {
  width: 793px;
  transform-origin: top left;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
}
`;
