import { applyRegexStage, createAnonState } from "./regex.js";
import { detectEntities } from "./gliner.js";
import { residualPass } from "./llama.js";

const STAGE2_ENABLED = process.env.STAGE2_GLINER !== "off";
const STAGE3_ENABLED = process.env.STAGE3_LLAMA !== "off";

export async function anonymizeSections(sections) {
  const state = createAnonState();

  let teilnahme = applyRegexStage(sections.teilnahme ?? "", state);
  let ablauf = applyRegexStage(sections.ablauf ?? "", state);
  let fazit = applyRegexStage(sections.fazit ?? "", state);

  if (STAGE2_ENABLED) {
    try {
      teilnahme = await glinerPass(teilnahme, state);
      ablauf = await glinerPass(ablauf, state);
      fazit = await glinerPass(fazit, state);
    } catch {
      // graceful degradation — regex result steht noch
    }
  }

  if (STAGE3_ENABLED) {
    try {
      teilnahme = await llamaPass(teilnahme, state);
      ablauf = await llamaPass(ablauf, state);
      fazit = await llamaPass(fazit, state);
    } catch {
      // graceful degradation
    }
  }

  return {
    anonymized: { teilnahme, ablauf, fazit },
    entities: state.entities,
  };
}

async function glinerPass(text, state) {
  if (!text) return text;
  const { entities } = await detectEntities(text);
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  let result = text;
  for (const ent of sorted) {
    const type = mapGlinerLabel(ent.label);
    if (!type) continue;
    const existing = state.originalToPlaceholder.get(ent.text);
    const placeholder =
      existing ??
      (() => {
        const next = (state.counters.get(type) ?? 0) + 1;
        state.counters.set(type, next);
        const ph = `[${type}_${next}]`;
        state.originalToPlaceholder.set(ent.text, ph);
        state.entities.push({ type, original: ent.text, placeholder: ph });
        return ph;
      })();
    result = result.slice(0, ent.start) + placeholder + result.slice(ent.end);
  }
  return result;
}

async function llamaPass(text, state) {
  if (!text) return text;
  const { skipped, entities } = await residualPass(text);
  if (skipped || entities.length === 0) return text;

  let result = text;
  for (const ent of entities) {
    if (!ent?.text) continue;
    const type = mapLlamaKategorie(ent.kategorie);
    const existing = state.originalToPlaceholder.get(ent.text);
    const placeholder =
      existing ??
      (() => {
        const next = (state.counters.get(type) ?? 0) + 1;
        state.counters.set(type, next);
        const ph = `[${type}_${next}]`;
        state.originalToPlaceholder.set(ent.text, ph);
        state.entities.push({ type, original: ent.text, placeholder: ph });
        return ph;
      })();
    result = result.split(ent.text).join(placeholder);
  }
  return result;
}

function mapGlinerLabel(raw) {
  const k = String(raw ?? "").toUpperCase();
  if (k === "PERSON") return "NAME";
  if (k === "LOCATION") return "ORT";
  if (k === "ORGANIZATION") return "ORG";
  return null;
}

function mapLlamaKategorie(raw) {
  const k = String(raw ?? "").toUpperCase();
  if (k === "NAME") return "NAME";
  if (k === "ORT") return "ORT";
  if (k === "ORGANISATION") return "ORG";
  return "SONSTIGES";
}
