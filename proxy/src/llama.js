const IONOS_ENDPOINT =
  process.env.IONOS_AI_ENDPOINT ??
  "https://openai.inference.de-txl.ionos.com/v1/chat/completions";
const MODEL = process.env.IONOS_AI_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct";

const SYSTEM_PROMPT = `Du erhältst einen bereits teilredigierten deutschen Text. Namen, Orte, Daten, PLZ, E-Mails, Telefonnummern und Kunden-Nummern wurden bereits durch Platzhalter wie [NAME_1], [ORT_1] ersetzt.

Deine Aufgabe: Finde ÜBERSEHENE Personenbezüge, die der vorherigen Redaktion entgangen sind — z.B. kontextuelle Verweise ("meine Nachbarin Frau K.", "der Lebensgefährte des Teilnehmers"), Spitznamen, Firmennamen mit Personenbezug, Initialen, Abteilungsbezeichnungen mit einer Person darin.

Antworte ausschließlich als JSON-Array mit Objekten der Form { "text": "<wörtliches Zitat>", "kategorie": "NAME|ORT|ORGANISATION|SONSTIGES" }. Kein Fließtext, keine Erklärung. Leeres Array [] wenn nichts übersehen wurde.`;

export async function residualPass(redactedText) {
  const token = process.env.IONOS_AI_TOKEN;
  if (!token) {
    return { skipped: true, reason: "IONOS_AI_TOKEN not set", entities: [] };
  }

  const res = await fetch(IONOS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: redactedText },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`IONOS AI Hub HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "[]";

  let entities = [];
  try {
    const parsed = JSON.parse(raw);
    entities = Array.isArray(parsed) ? parsed : (parsed.entities ?? []);
  } catch {
    entities = [];
  }

  return { skipped: false, entities };
}
