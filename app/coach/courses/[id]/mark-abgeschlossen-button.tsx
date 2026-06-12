"use client";

import { useActionState, useState } from "react";

import {
  markCourseAbgeschlossen,
  type MarkAbgeschlossenState,
} from "./actions";

/**
 * Coach-Klick „Maßnahme als abgeschlossen markieren". Schritt vor der
 * Teilnehmer-Freigabe und der BT-Prüfung. Der Coach bestätigt damit aktiv,
 * dass keine weiteren Termine mehr kommen.
 *
 * Sind die bewilligten UE voll geleistet, reicht eine einfache Bestätigung.
 * Liegt die geleistete UE-Zahl DARUNTER (vorzeitiges Ende, inkl. 0 UE bei
 * Sofort-Abbruch), ist eine Begründung PFLICHT — sie wird auf dem Kurs
 * gespeichert und dem Bildungsträger in der Prüfung angezeigt. Die finale
 * Gate-Prüfung passiert serverseitig.
 */
export function MarkAbgeschlossenButton({
  courseId,
  geleisteteUe,
  bewilligteUe,
}: {
  courseId: string;
  geleisteteUe: number;
  bewilligteUe: number;
}) {
  const [state, action, pending] = useActionState<
    MarkAbgeschlossenState,
    FormData
  >(markCourseAbgeschlossen, undefined);

  const vollstaendig = geleisteteUe >= bewilligteUe;
  const [begruendung, setBegruendung] = useState("");

  const geleistetLabel = geleisteteUe.toString().replace(".", ",");

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (vollstaendig) {
          if (
            !window.confirm(
              "Maßnahme jetzt als abgeschlossen markieren?\n\nDanach holst du die Teilnehmer-Freigabe und die Bildungsträger-Prüfung ein. Falls du noch Termine ergänzt oder zurücksetzt, musst du diese Bestätigung erneut geben.",
            )
          ) {
            e.preventDefault();
          }
          return;
        }
        // Unvollständig → Begründung Pflicht (client-seitige Vorprüfung; der
        // Server erzwingt es nochmal).
        if (begruendung.trim().length === 0) {
          e.preventDefault();
          window.alert(
            "Es sind weniger UE geleistet als bewilligt. Bitte gib eine Begründung für den vorzeitigen Abschluss an.",
          );
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      {!vollstaendig && (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-700">
            Erst {geleistetLabel} von {bewilligteUe} bewilligten UE geleistet.
            Für den vorzeitigen Abschluss ist eine Begründung nötig — der
            Bildungsträger sieht sie bei der Prüfung.
          </p>
          <textarea
            name="begruendung"
            value={begruendung}
            onChange={(e) => setBegruendung(e.target.value)}
            rows={3}
            placeholder="Begründung für den vorzeitigen Abschluss (z. B. Teilnehmer hat die Maßnahme abgebrochen)…"
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
          : vollstaendig
            ? "Maßnahme als abgeschlossen markieren"
            : "Vorzeitig abschließen (mit Begründung)"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
