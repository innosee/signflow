/**
 * Deterministische Severity-Leitplanke gegen hard_block-Flip-Flops.
 *
 * Der Prompt definiert hard_block als seltene Ausnahme, die NUR greift, wenn
 * der Bericht einen der explizit gelisteten Begriffe „wörtlich oder
 * fast-wörtlich" enthält (prompt.ts, Abschnitt A). Das Modell hält sich
 * nicht immer daran: identischer Satz wird in Runde 1 als soft_flag, in
 * Runde 2 als hard_block eingestuft (beobachtet 2026-07-15, „Vermutlich
 * liegt ein Selbstwertproblem vor…"). Dazu kommt, dass parseAndValidate
 * bei fehlender severity auf hard_block defaultet.
 *
 * Diese Leitplanke erzwingt die Prompt-Definition im Code: ein hard_block,
 * dessen Zitat KEINEN der gelisteten Begriffe enthält, wird auf soft_flag
 * herabgestuft. Er bleibt als Hinweis voll sichtbar — nur der blockierende/
 * „Sensibel"-Charakter entfällt. Die Liste ist bewusst ETWAS breiter als
 * die Prompt-Liste (Wortstämme + verwandte Begriffe), damit nur klare
 * Fehlklassifikationen herabgestuft werden und echte Art-9-/Ablehnungs-
 * Risiken den hard_block behalten.
 *
 * Muss inhaltlich synchron zur hard_block-Liste in prompt.ts bleiben.
 */
const HARD_BLOCK_TERMS: readonly string[] = [
  // Explizite medizinische Diagnosen (Art 9) — Wortstämme
  "depress",
  "burnout",
  "burn-out",
  "adhs",
  "angststörung",
  "panikattack",
  "ptbs",
  "trauma",
  "psychisch",
  "erkrank",
  "diagnos",
  "suizid",
  "sucht",
  "alkohol",
  "therapie",
  // Explizite Diagnostik-Aussagen
  "arbeitsunfähig",
  "therapiebedürftig",
  "behandlungsbedürftig",
  // Explizite Schuldzuweisung Dritter
  "gemobbt",
  "mobbing",
  "diskriminier",
  "belästig",
  // Explizite Pathologisierung
  "narzisstisch",
  "toxisch",
  "manipulativ",
  "krankhaft",
  // Explizite negative Prognose
  "nicht vermittelbar",
  "unvermittelbar",
  "ungeeignet",
  "erfolglos",
  "keine eignung",
  // Explizite Küchenpsychologie (Familien-Diagnosen). "kindheit" als Stamm:
  // jede Kindheits-Psychologisierung über den TN ist im BER ein Risiko,
  // Flexionsformen ("schweren Kindheit") matchen sonst nicht.
  "kindheit",
  "problematischer vater",
  "problematische mutter",
  "elternhaus",
];

/**
 * True, wenn das Zitat einen der explizit gelisteten hard_block-Begriffe
 * (fast-)wörtlich enthält — nur dann darf die Violation als hard_block
 * durchgehen. Case-insensitiv; die Begriffe sind PII-frei und überleben
 * damit die IONOS-Anonymisierung unverändert (der Check läuft auf dem
 * anonymisierten Zitat, VOR dem Reverse-Mapping).
 */
export function quoteJustifiesHardBlock(quote: string): boolean {
  const q = quote.toLowerCase();
  return HARD_BLOCK_TERMS.some((term) => q.includes(term));
}
