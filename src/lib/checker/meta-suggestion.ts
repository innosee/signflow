/**
 * Erkennt Meta-Vorschläge: `suggestion`-Texte, die ÜBER den Bericht sprechen
 * („Es wäre besser, diese Formulierung zu vermeiden…") statt einsetzbarer
 * Ersatztext zu sein. Der Prompt verbietet das (KRITISCH-Sektion), aber das
 * Modell hält sich nicht immer daran — und „Im Text übernehmen" hat solchen
 * Beratungssprech dann wörtlich in den Bericht geklebt (beobachtet
 * 2026-07-15: „Zwei Termine sagte er kurzfristig ab, Es wäre hilfreich, die
 * Teilnahme als Lernprozess zu betrachten…").
 *
 * Bei erkanntem Meta-Vorschlag blendet die ViolationCard den
 * „Im Text übernehmen"-Button aus — der Coach kann die Stelle markieren und
 * selbst umformulieren, aber nie versehentlich Ratschlags-Text einfügen.
 *
 * Heuristik bewusst konservativ: nur eindeutige Ratschlags-Marker. Ein
 * False-Negative (Meta rutscht durch) ist ärgerlich, ein False-Positive
 * (guter Ersatztext nicht übernehmbar) nur ein Klick mehr.
 */
const META_PATTERNS: readonly RegExp[] = [
  // „Es wäre/ist/könnte/kann besser/hilfreich/ratsam … (sein)"
  /\bes (?:wäre|ist|könnte|kann) (?:\w+ )?(?:besser|hilfreich|ratsam|sinnvoll|empfehlenswert|angebracht)\b/i,
  // „Stattdessen könnte/sollte man …", „man könnte/sollte formulieren …"
  /\bstattdessen (?:könnte|sollte|kann|wäre)\b/i,
  /\bman (?:könnte|sollte|kann) (?:formulieren|schreiben|erwähnen|beschreiben)\b/i,
  // Sprechen über „diese/die Formulierung"
  /\bdiese[rs]? Formulierung\b/i,
  /\bdie Formulierung (?:sollte|könnte|kann|zu)\b/i,
  // „… zu vermeiden/betonen/erwähnen/hinzuweisen(.)" als Infinitiv-Ratschlag
  /\bzu (?:vermeiden|betonen|erwähnen|hinzuweisen|umschreiben|entschärfen)\b/i,
  // „Es empfiehlt sich …", „Wir empfehlen …"
  /\bes empfiehlt sich\b/i,
  /\bempfehlenswert wäre\b/i,
  // Direkte Ansprache des Coaches
  /\bvermeiden Sie\b/,
  /\bformulieren Sie\b/,
];

export function isMetaSuggestion(suggestion: string): boolean {
  return META_PATTERNS.some((p) => p.test(suggestion));
}
