const STEPS = [
  {
    num: "01",
    title: "Kurs + Teilnehmer:innen anlegen",
    desc: "Agentur legt Kurse an, Coach ergänzt Teilnehmer:innen, Sessions laufend dokumentieren — Datum, UE, Themen, Modus.",
  },
  {
    num: "02",
    title: "Coach signiert pro Einheit",
    desc: "Canvas-Unterschrift einmalig anlegen, pro Session eine aktive Bestätigung mit Klick + Zeitstempel.",
  },
  {
    num: "03",
    title: "Teilnehmer:in bestätigt per Magic-Link",
    desc: "Automatische Mail nach Coach-Sign. Kein Account nötig — TN unterschreibt einmalig im Browser, bestätigt dann offene Einheiten.",
  },
  {
    num: "04",
    title: "PDF mit FES an die AfA",
    desc: "Finales A4-PDF wird mit fortgeschrittener elektronischer Signatur (FES nach eIDAS) versiegelt und übermittelt.",
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
            In vier Schritten von der Session zum rechtssicheren Nachweis.
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
