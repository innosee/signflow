"use client";

import { useActionState, useState } from "react";

import { abschlussStatus } from "@/lib/abschluss-status";

import {
  markCourseAbgeschlossen,
  type MarkAbgeschlossenState,
} from "./actions";

/**
 * Coach-Klick „Maßnahme als abgeschlossen markieren". Schritt vor der
 * Teilnehmer-Freigabe und der BT-Prüfung. Der Coach bestätigt damit aktiv,
 * dass keine weiteren Termine mehr kommen.
 *
 * Differenziert zwei unabhängige Umstände (siehe `abschluss-status.ts`):
 *  - **zeitlich vorzeitig** (letzter Termin < Bewilligungsende) → nur Hinweis.
 *  - **UE-Unterschreitung** (weniger UE als bewilligt) → Begründung PFLICHT.
 * Ohne erfasstes Bewilligungsende ist der Abschluss gesperrt (Server erzwingt
 * es ebenfalls). Die finale Gate-Prüfung passiert serverseitig.
 */
export function MarkAbgeschlossenButton({
  courseId,
  geleisteteUe,
  bewilligteUe,
  letzterTermin,
  bewilligungsende,
}: {
  courseId: string;
  geleisteteUe: number;
  bewilligteUe: number;
  letzterTermin: string | null;
  bewilligungsende: string | null;
}) {
  const [state, action, pending] = useActionState<
    MarkAbgeschlossenState,
    FormData
  >(markCourseAbgeschlossen, undefined);

  const st = abschlussStatus({
    geleisteteUe,
    bewilligteUe,
    letzterTermin,
    bewilligungsende,
  });
  const [begruendung, setBegruendung] = useState("");

  const geleistetLabel = geleisteteUe.toString().replace(".", ",");
  const fehlendLabel = st.fehlendeUe.toString().replace(".", ",");

  // Bewilligungsende fehlt → Abschluss gesperrt (zeitliche Achse nicht rechenbar).
  if (!bewilligungsende) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Abschluss erst möglich, sobald das <strong>Bewilligungsende</strong> der
        Maßnahme erfasst ist — das trägt der Bildungsträger nach Erhalt der
        Bewilligung ein.
      </p>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!st.begruendungPflicht) {
          if (
            !window.confirm(
              "Maßnahme jetzt als abgeschlossen markieren?\n\nDanach holst du die Teilnehmer-Freigabe und die Bildungsträger-Prüfung ein. Falls du noch Termine ergänzt oder zurücksetzt, musst du diese Bestätigung erneut geben.",
            )
          ) {
            e.preventDefault();
          }
          return;
        }
        // UE-Unterschreitung → Begründung Pflicht (client-seitige Vorprüfung;
        // der Server erzwingt es nochmal).
        if (begruendung.trim().length === 0) {
          e.preventDefault();
          window.alert(
            "Es sind weniger UE geleistet als bewilligt. Bitte gib eine Begründung für die UE-Unterschreitung an.",
          );
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />

      {/* Status-Zusammenfassung — benennt beide Achsen separat. */}
      <div className="space-y-1 text-xs text-zinc-600">
        <p>
          {st.ueUnterschritten ? (
            <span className="text-amber-700">
              {geleistetLabel} von {bewilligteUe} UE geleistet —{" "}
              <strong>{fehlendLabel} UE fehlen</strong> (Begründung nötig).
            </span>
          ) : (
            <>Alle {bewilligteUe} bewilligten UE geleistet.</>
          )}
        </p>
        {st.zeitlichVorzeitig && (
          <p className="text-zinc-500">
            Letzter Termin liegt{" "}
            {st.tageFrueher !== null ? `${st.tageFrueher} Tage ` : ""}vor dem
            Bewilligungsende — Maßnahme endet zeitlich vorzeitig (nur Hinweis,
            wird auf dem Nachweis vermerkt).
          </p>
        )}
      </div>

      {st.begruendungPflicht && (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-700">
            Für die UE-Unterschreitung ist eine Begründung nötig — der
            Bildungsträger sieht sie bei der Prüfung.
          </p>
          <textarea
            name="begruendung"
            value={begruendung}
            onChange={(e) => setBegruendung(e.target.value)}
            rows={3}
            placeholder="Begründung für die UE-Unterschreitung (z. B. Teilnehmer hat die Maßnahme abgebrochen)…"
            className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-800 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40"
      >
        {pending
          ? "Wird bestätigt…"
          : st.begruendungPflicht
            ? "Abschließen (mit Begründung)"
            : "Maßnahme als abgeschlossen markieren"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
