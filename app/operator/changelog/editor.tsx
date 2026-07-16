"use client";

import { useActionState, useState } from "react";

import { formatDateDE } from "@/lib/format-date";

import {
  createChangelogEntry,
  deleteChangelogEntry,
  type ChangelogEditorState,
} from "./actions";

type EntryRow = { id: string; title: string; publishedAt: Date };

export function ChangelogEditor({ entries }: { entries: EntryRow[] }) {
  // Secret einmal eintippen, in jede Aktion (Create + Delete) als Hidden-Feld
  // mitgeben. Bewusst controlled, damit es über Form-Resets hinweg bleibt.
  const [secret, setSecret] = useState("");
  // Titel + Text controlled — sonst resettet React 19 das Form nach der Action
  // und der getippte Text ist bei einem Fehler (z.B. falsches Secret) weg.
  // Konvention: docs/forms-server-actions.md.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Action-Wrapper: leert Titel + Text NUR bei Erfolg (im Transition-Kontext,
  // nicht per Effect). Bei Fehler bleibt die Eingabe zum Korrigieren stehen.
  const [createState, createAction, creating] = useActionState<
    ChangelogEditorState,
    FormData
  >(async (prev, formData) => {
    const res = await createChangelogEntry(prev, formData);
    if (res?.success) {
      setTitle("");
      setBody("");
    }
    return res;
  }, undefined);
  const [deleteState, deleteAction] = useActionState<
    ChangelogEditorState,
    FormData
  >(deleteChangelogEntry, undefined);

  const inputClass =
    "block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black";

  return (
    <div className="space-y-8">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Operator-Secret <span className="text-red-600">*</span>
        </span>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
          placeholder="OPERATOR_ONBOARD_SECRET"
          className={inputClass}
        />
        <span className="text-xs text-zinc-500">
          Wird für Veröffentlichen und Löschen verwendet. Nicht gespeichert.
        </span>
      </label>

      <form action={createAction} className="space-y-4">
        <input type="hidden" name="secret" value={secret} readOnly />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Titel <span className="text-red-600">*</span>
          </span>
          <input
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Erstgespräch vor Gutschein & mobile Bedienung"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Text <span className="text-red-600">*</span>
          </span>
          <textarea
            name="body"
            required
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Plaintext mit Zeilenumbrüchen. Wird auf der „Neu“-Seite 1:1 angezeigt."
            className={inputClass}
          />
        </label>

        {createState?.error && (
          <p role="alert" className="text-sm text-red-700">
            {createState.error}
          </p>
        )}
        {createState?.success && (
          <p className="text-sm text-emerald-700">{createState.success}</p>
        )}

        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-60"
        >
          {creating ? "Wird veröffentlicht…" : "Veröffentlichen"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Veröffentlicht ({entries.length})
        </h2>
        {deleteState?.error && (
          <p role="alert" className="text-sm text-red-700">
            {deleteState.error}
          </p>
        )}
        {deleteState?.success && (
          <p className="text-sm text-emerald-700">{deleteState.success}</p>
        )}
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500">Noch keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-300 bg-white">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {e.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatDateDE(e.publishedAt)}
                  </p>
                </div>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="secret" value={secret} readOnly />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Löschen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
