const STEPS = [
  {
    num: "01",
    title: "Kunde anlegen + Coach zuweisen",
    desc: "Bildungsträger legt den Kunden (1 Maßnahme = 1 Teilnehmer:in) an und weist ihn einem Coach zu. Der Coach dokumentiert dann laufend Termine — Datum, UE, Themen, Modus.",
  },
  {
    num: "02",
    title: "Erstgespräch + Termine signieren",
    desc: "Das Erstgespräch bewertet die Eignung über vier Kriterien (++/O/––). Danach signiert der Coach jeden Termin mit einem Klick + Zeitstempel — Canvas-Unterschrift wird nur einmal angelegt.",
  },
  {
    num: "03",
    title: "Teilnehmer:in bestätigt per Magic-Link",
    desc: "Coach löst den Link aus — per E-Mail oder QR-Code vor Ort. Kein Account nötig: TN unterschreibt einmalig im Browser und bestätigt dann alle offenen Termine.",
  },
  {
    num: "04",
    title: "Freigabe, Abschluss & Übermittlung",
    desc: "Der Bildungsträger prüft die fertige Liste und gibt sie frei. Erst dann schließt der Coach das A4-PDF mit einfacher elektronischer Signatur ab — fertig für die AfA. Das FES-Siegel nach eIDAS ist in Vorbereitung.",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="workflow" className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Workflow
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            In vier Schritten vom Termin zum rechtssicheren Nachweis.
          </h2>
        </div>

        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li
              key={s.num}
              className="relative rounded-xl border border-zinc-200 bg-white p-6"
            >
              <div className="text-xs font-semibold tracking-widest text-emerald-600">
                {s.num}
              </div>
              <h3 className="mt-3 text-base font-semibold text-zinc-950">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {s.desc}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
