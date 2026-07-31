"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { type Bundesland, getFeiertag } from "@/lib/feiertage";
import { isoWeek, isoWeekKey } from "@/lib/termine-pro-woche";

import { createSession, type SessionFormState } from "../../actions";
import { EignungAnalyseFieldset } from "../eignung-fieldset";

export function SessionForm({
  courseId,
  courseTitle,
  bundesland,
  erstgespraechExists = false,
  existingUeDates = [],
  bewilligteUe,
  bereitsVerplanteUe = 0,
  avgsGueltigVon,
}: {
  courseId: string;
  courseTitle: string;
  bundesland: Bundesland | null;
  /** #4: Existiert schon ein Erstgespräch, wird die Option ausgeblendet. */
  erstgespraechExists?: boolean;
  /** Reguläre UE-Termine des Kurses — für die „2 Termine/Woche"-Warnung. */
  existingUeDates?: string[];
  /** Bewilligte UE der Maßnahme — für den UE-Budget-Hinweis. */
  bewilligteUe: number;
  /** Bereits verplante reguläre UE (ohne diesen Termin). */
  bereitsVerplanteUe?: number;
  /** AVGS-Gutschein-Beginn (YYYY-MM-DD) — für den weichen Erstgespräch-Hinweis. */
  avgsGueltigVon: string;
}) {
  const [state, action, pending] = useActionState<SessionFormState, FormData>(
    createSession,
    undefined,
  );
  // Kein Erstgespräch erfasst → Formular startet im Erstgespräch-Modus, damit
  // das Kennenlerngespräch der natürliche erste Termin ist. Existiert schon
  // eins, ist die Option ausgeblendet und dies bleibt false.
  const [isErstgespraech, setIsErstgespraech] = useState(!erstgespraechExists);
  const [sessionDate, setSessionDate] = useState("");
  const [anzahlUe, setAnzahlUe] = useState("");

  // Harte Regel (auch serverseitig): ohne Erstgespräch kein Coaching-Termin.
  // Will der Coach hier eine reguläre UE anlegen, obwohl noch kein Erstgespräch
  // existiert, wird der Submit gesperrt und erklärt.
  const erstgespraechZuerst = !erstgespraechExists && !isErstgespraech;

  // UE-Budget-Hinweis (live, „bei der Eingabe"): bereits verplante UE + die
  // gerade eingegebene dürfen die bewilligten UE nicht überschreiten. Reine
  // Vorab-Anzeige — die harte Grenze zieht die Server-Action (validateCross-
  // SessionRules). Erstgespräch zählt 0 UE → kein Budget-Verbrauch.
  const ueNum = Number.parseFloat(anzahlUe.replace(",", "."));
  const ueEingabe = !isErstgespraech && Number.isFinite(ueNum) ? ueNum : 0;
  const verplantMitNeu = bereitsVerplanteUe + ueEingabe;
  const ueFrei = bewilligteUe - bereitsVerplanteUe;
  const ueUeberschritten = verplantMitNeu > bewilligteUe;
  const fmtUe = (n: number) =>
    Number.isInteger(n) ? `${n}` : n.toString().replace(".", ",");

  // Weiche Warnung: Coaching findet an Feiertagen i.d.R. nicht statt. Nur ein
  // Hinweis, kein Block — Ausnahmen kommen vor (anders als das harte Wochenend-
  // Gate in der Server-Action). `null`-Bundesland (Bestandskunde) → keine
  // Warnung.
  const feiertag = getFeiertag(sessionDate, bundesland);

  // Weicher Hinweis: Erstgespräch vor Gutschein-Beginn. Kein Block — manche
  // Agenturen verlangen das Erstgespräch ausdrücklich vor der Gutschein-
  // ausstellung (User-Feedback). Reiner String-Vergleich (beide YYYY-MM-DD).
  const erstgespraechVorGutschein =
    isErstgespraech &&
    /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) &&
    sessionDate < avgsGueltigVon;

  // Weiche „2 Termine/Woche"-Warnung: liegt in der ISO-Woche des gewählten
  // Datums noch kein weiterer regulärer UE-Termin, hätte die Woche mit diesem
  // nur 1 UE. Nur ein Hinweis (künftige Termine können die Woche noch füllen),
  // greift nicht beim Erstgespräch (0 UE).
  const wenigeTermineWarnung = (() => {
    if (!sessionDate || isErstgespraech) return null;
    const m = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate);
    if (!m) return null;
    const key = isoWeekKey(sessionDate);
    const andereInWoche = existingUeDates.filter(
      (d) => isoWeekKey(d) === key,
    ).length;
    if (andereInWoche >= 1) return null;
    return isoWeek(sessionDate).week;
  })();

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="courseId" value={courseId} />

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Neuer Termin</h2>
          <p className="text-sm text-zinc-500">
            Für Kunde: <span className="font-medium">{courseTitle}</span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Datum <span className="text-red-600">*</span>
            </span>
            <input
              type="date"
              name="sessionDate"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            />
            <span className="text-xs text-zinc-500">
              Mo–Sa möglich. Sonntage sind gesperrt, Feiertage werden markiert.
              AfA-Richtwert: i.d.R. mind. 2 Termine pro Woche.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Modus <span className="text-red-600">*</span>
            </span>
            <select
              name="modus"
              defaultValue={state?.values?.modus || "praesenz"}
              required
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="praesenz">Präsenz</option>
              <option value="online">Online</option>
            </select>
          </label>

          {!isErstgespraech && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">
                UE <span className="text-red-600">*</span>
              </span>
              <input
                type="number"
                name="anzahlUe"
                step="0.5"
                min="0.5"
                max="24"
                required
                placeholder="z.B. 2"
                value={anzahlUe}
                onChange={(e) => setAnzahlUe(e.target.value)}
                aria-invalid={ueUeberschritten}
                className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ${
                  ueUeberschritten
                    ? "border-red-500 focus:border-red-600"
                    : "border-zinc-500 focus:border-black"
                }`}
              />
              <span
                className={`text-xs ${
                  ueUeberschritten ? "font-medium text-red-700" : "text-zinc-500"
                }`}
              >
                {ueUeberschritten
                  ? `Überschreitet die bewilligten ${bewilligteUe} UE um ${fmtUe(verplantMitNeu - bewilligteUe)} — Anlegen wird blockiert.`
                  : `Noch ${fmtUe(ueFrei)} von ${bewilligteUe} UE frei.`}
              </span>
            </label>
          )}
        </div>


        {feiertag && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            ⚠️ Der {formatGermanDate(sessionDate)} ist ein Feiertag
            <span className="font-medium"> ({feiertag})</span> — findet hier
            wirklich ein Coaching statt? Anlegen bleibt möglich.
          </p>
        )}

        {erstgespraechVorGutschein && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            ℹ️ Das Erstgespräch liegt vor Beginn der AVGS-Gutschein-Gültigkeit
            (ab {formatGermanDate(avgsGueltigVon)}) — das ist bei manchen
            Agenturen so vorgegeben. Anlegen bleibt möglich.
          </p>
        )}

        {wenigeTermineWarnung !== null && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            ℹ️ In KW {wenigeTermineWarnung} gibt es mit diesem Termin erst{" "}
            <span className="font-medium">einen</span> UE-Termin — die AfA
            empfiehlt mind. 2 pro Woche. Anlegen bleibt möglich.
          </p>
        )}

        {erstgespraechExists ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Für diese Maßnahme ist bereits ein Erstgespräch erfasst — ein
            zweites ist nicht möglich.
          </p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isErstgespraech"
              checked={isErstgespraech}
              onChange={(e) => setIsErstgespraech(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Erstgespräch</span>
              <span className="block text-xs text-zinc-500">
                Zählt keine UE, braucht aber die Eignungsanalyse.
              </span>
            </span>
          </label>
        )}

        {erstgespraechZuerst && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Für diese Maßnahme ist noch <span className="font-medium">kein
            Erstgespräch (Kennenlerngespräch)</span> erfasst. Bitte lege zuerst
            das Erstgespräch an — ein Coaching-Termin ist erst danach möglich.
            Setze dazu oben den Haken <span className="font-medium">Erstgespräch</span>.
          </p>
        )}

        {!erstgespraechExists && isErstgespraech && (
          <EignungAnalyseFieldset
            defaultEignung={state?.values?.eignungsanalyse}
            defaultGeeignet={state?.values?.geeignet}
          />
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Themen / Inhalte
          </span>
          <textarea
            name="topic"
            rows={4}
            defaultValue={state?.values?.topic ?? ""}
            placeholder="z.B. Lebenslauf-Feedback, Bewerbungstraining, Zielklärung"
            className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          />
          <span className="block text-xs text-zinc-500">
            Kann leer bleiben und später über &bdquo;Inhalt korrigieren&ldquo;
            nachgetragen werden. Für die ANW-Prüfung müssen aber alle Termine
            Inhalte haben.
          </span>
        </label>

      </section>

      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || erstgespraechZuerst}
          title={
            erstgespraechZuerst
              ? "Zuerst das Erstgespräch (Kennenlerngespräch) anlegen"
              : undefined
          }
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Wird angelegt…" : "Termin anlegen"}
        </button>
        <Link
          href={`/coach/courses/${courseId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}

// `YYYY-MM-DD` → `DD.MM.YYYY`. Keine Date-Parsing-Konvertierung (Zeitzonen-
// Falle), reines String-Splitting — `sessionDate` ist ein Kalendertag.
function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
