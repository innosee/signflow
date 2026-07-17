import type { SupportMessage } from "./azure-chat";

/**
 * Deterministischer PII-Scrub für den Coach-Support-Chat — läuft serverseitig
 * vor JEDEM externen Abgang (Azure OpenAI, Resend-Eskalationsmail,
 * Slack/Teams-Webhook).
 *
 * ## Warum Regex statt IONOS-Anonymizer (Datenschutz-Audit 2026-07, P1-1)
 *
 * Der Checker anonymisiert über den IONOS-Proxy — aber **im Browser**: der
 * Rohtext geht Browser → IONOS, Vercel sieht ihn nie, und die Entity-Tabelle
 * fürs Reverse-Mapping bleibt clientseitig (src/lib/checker/anonymize.ts).
 * Für den Support-Chat passt das Modell nicht:
 *
 *  1. Der Chat-Verlauf erreicht Vercel ohnehin im Klartext (Server-Route
 *     /api/coach/support) — ein Server→IONOS→Azure-Umweg würde die
 *     Kern-Garantie des Checker-Designs („Vercel sieht keinen Rohtext")
 *     gar nicht herstellen, nur Latenz und Kopplung addieren.
 *  2. Der Proxy-Endpunkt ist auf die drei Berichts-Sections
 *     (teilnahme/ablauf/fazit) zugeschnitten, nicht auf Dialog-Verläufe.
 *  3. FAQ-Antworten brauchen kein Reverse-Mapping — PII ist hier nie
 *     Nutzsignal, Platzhalter im Prompt sind verlustfrei.
 *
 * **Empfehlung daher:** deterministischer Regex-Pass (dieses Modul) + gut
 * sichtbarer UI-Hinweis „keine Klarnamen/Kunden-Nr. eingeben" im Widget.
 * Sollte der Support-Chat je Fall-/Teilnehmerdaten verarbeiten (statt reiner
 * Bedienungsfragen), muss auf einen echten NER-Pass (IONOS) umgestellt werden
 * — Regexe erkennen freistehende Namen ohne Anrede prinzipbedingt nicht.
 *
 * Bewusst auch auf die Eskalationsmail und die Notiz angewendet
 * (Datenminimierung): Der Coach ist über coachName/coachEmail im Mail-Kopf
 * erreichbar, Teilnehmer-PII hat im Transcript Richtung Resend/Slack nichts
 * verloren. Platzhalter statt Löschung, damit der Dialog lesbar bleibt.
 */

type ScrubRule = {
  re: RegExp;
  replacement: string;
};

const RULES: ScrubRule[] = [
  // E-Mail-Adressen
  {
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: "[E-Mail]",
  },
  // Deutsche IBAN (DE + 20 Ziffern, optional in Vierergruppen)
  {
    re: /\bDE\d{2}(?:\s?\d{4}){4}\s?\d{2}\b/g,
    replacement: "[IBAN]",
  },
  // BA-Kundennummer: 3 Ziffern + Buchstabe + 5 Ziffern (z. B. 123A45678)
  {
    re: /\b\d{3}[A-Za-z]\d{5}\b/g,
    replacement: "[Kunden-Nr]",
  },
  // Telefonnummern: +49/0049/0-Vorwahl, danach mind. 6 weitere Ziffern mit
  // optionalen Trennern. Punkt bewusst NICHT als Trenner, sonst matchen
  // Datumsangaben wie 01.02.2026.
  {
    re: /(?:(?:\+49|0049)[\s\-/()]?|0)[1-9](?:[\s\-/()]?\d){5,}/g,
    replacement: "[Telefonnummer]",
  },
  // Anrede + Name: „Herr/Herrn/Frau/Hr./Fr. [Dr./Prof.] Vorname[- ]Nachname"
  {
    re: /\b(?:Herrn?|Frau|Hr\.|Fr\.)\s+(?:(?:Dr|Prof)\.\s+)*[A-ZÄÖÜ][a-zäöüß]+(?:[- ][A-ZÄÖÜ][a-zäöüß]+)?/g,
    replacement: "[Name]",
  },
  // Rollenwort + voller Name: „Teilnehmer(in)/Kunde/Kundin/Klient(in)
  // Vorname Nachname" — bewusst zwei großgeschriebene Wörter verlangt, ein
  // einzelnes wäre im Deutschen (Substantiv-Großschreibung) zu falsch-positiv.
  {
    re: /\b(Teilnehmer(?:in)?|Kund(?:e|in)|Klient(?:in)?)\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\b/g,
    replacement: "$1 [Name]",
  },
];

/** Ersetzt erkennbare PII-Muster durch lesbare Platzhalter. */
export function scrubPii(text: string): string {
  let out = text;
  for (const { re, replacement } of RULES) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Wendet {@link scrubPii} auf alle Nachrichten eines Verlaufs an. */
export function scrubMessages(messages: SupportMessage[]): SupportMessage[] {
  return messages.map((m) => ({ ...m, content: scrubPii(m.content) }));
}
