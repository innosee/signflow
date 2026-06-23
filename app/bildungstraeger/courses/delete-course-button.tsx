"use client";

import { useCallback, useEffect, useState } from "react";

import { deleteCourse } from "./actions";

/**
 * Kunden-Löschen-Button (Testphase). Öffnet ein Warn-Modal, das unmissver-
 * ständlich auf die UNWIDERRUFLICHE Löschung hinweist — inkl. aller bereits
 * vom Coach erfassten Termine und Signaturen. Erst der explizite Klick auf
 * „Endgültig löschen" reicht das Server-Action-Form ein.
 */
export function DeleteCourseButton({
  courseId,
  participantName,
}: {
  courseId: string;
  participantName: string;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Escape schließt das Modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        Löschen
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Kunden ${participantName} löschen`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-950">
                Kunden unwiderruflich löschen?
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Schließen"
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                ×
              </button>
            </div>

            <div className="mt-3 space-y-3 text-sm text-zinc-700">
              <p>
                <span className="font-medium text-zinc-950">
                  {participantName}
                </span>{" "}
                wird vollständig gelöscht — zusammen mit{" "}
                <span className="font-medium">allen Terminen, Signaturen,
                Magic-Links, Freigaben, Berichten</span>{" "}
                und dem finalen Dokument dieser Maßnahme.
              </p>
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                Dies geschieht <span className="font-semibold">sofort und
                unwiderruflich</span> — auch wenn der Coach bereits
                unterschrieben oder Termine erfasst hat. Es gibt keine
                Wiederherstellung.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Abbrechen
              </button>
              <form action={deleteCourse}>
                <input type="hidden" name="courseId" value={courseId} />
                <button
                  type="submit"
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Endgültig löschen
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
