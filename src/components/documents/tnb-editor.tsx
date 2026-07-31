"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { formatDateDE } from "@/lib/format-date";
import { isMassnahmeTyp } from "@/lib/massnahme-typ";
import {
  TNB_CUSTOM_LINES,
  TNB_KATALOGE,
} from "@/lib/documents/tnb-katalog";

type TnbState =
  | { error?: string; success?: boolean; issued?: boolean }
  | undefined;

type Props = {
  documentId: string;
  status: "draft" | "active" | "completed";
  massnahmeTyp: string;
  initialSelectedKeys: string[];
  initialCustomLines: string[];
  courseInfo: {
    von: string | null;
    bis: string | null;
    ue: number;
    ort: string;
  };
  hasOrgSignature: boolean;
  action: (prev: TnbState, formData: FormData) => Promise<TnbState>;
};

export function TnbEditor({
  documentId,
  status,
  massnahmeTyp,
  initialSelectedKeys,
  initialCustomLines,
  courseInfo,
  hasOrgSignature,
  action,
}: Props) {
  const router = useRouter();
  const typ = isMassnahmeTyp(massnahmeTyp) ? massnahmeTyp : null;
  const katalog = typ ? TNB_KATALOGE[typ] : null;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedKeys),
  );
  const [custom, setCustom] = useState<string[]>(() => {
    const arr = [...initialCustomLines];
    while (arr.length < TNB_CUSTOM_LINES) arr.push("");
    return arr.slice(0, TNB_CUSTOM_LINES);
  });

  const [state, formAction, pending] = useActionState<TnbState, FormData>(
    async (prev, fd) => {
      const res = await action(prev, fd);
      if (res?.issued) router.refresh();
      return res;
    },
    undefined,
  );

  const customFilled = custom.map((l) => l.trim()).filter(Boolean).length;
  const total = selected.size + customFilled;
  const atMax = katalog ? total >= katalog.max : false;

  const selectedKeysJson = useMemo(
    () => JSON.stringify([...selected]),
    [selected],
  );
  const customJson = useMemo(
    () => JSON.stringify(custom.map((l) => l.trim()).filter(Boolean)),
    [custom],
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Ausgestellt → read-only Statuskarte (Vorschau rechts zeigt das Ergebnis).
  if (status !== "draft") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-medium text-emerald-900">
          ✓ Teilnahmebescheinigung ausgestellt
        </p>
        <p className="mt-1 text-emerald-800">
          Sie liegt jetzt als PDF beim Kunden — erango kann sie herunterladen.
          Zum Ändern bitte löschen und neu anlegen.
        </p>
      </div>
    );
  }

  if (!katalog || !typ) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Für den Maßnahmentyp dieses Kurses gibt es keinen Inhalte-Katalog.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="selectedKeys" value={selectedKeysJson} />
      <input type="hidden" name="customLines" value={customJson} />

      <div>
        <p className="text-sm font-medium text-zinc-900">Inhalte auswählen</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {katalog.hint}.{" "}
          <span
            className={
              total > katalog.max ? "font-semibold text-rose-600" : "text-zinc-700"
            }
          >
            {total} / {katalog.max} gewählt
          </span>
        </p>
      </div>

      <div className="space-y-4">
        {katalog.groups.map((group, gi) => (
          <fieldset key={gi} className="space-y-1.5">
            {group.title && (
              <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {group.title}
              </legend>
            )}
            {group.items.map((item) => {
              const checked = selected.has(item.key);
              const disabled = !checked && atMax;
              return (
                <label
                  key={item.key}
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm ${
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(item.key)}
                    className="mt-0.5 h-4 w-4 accent-zinc-900"
                  />
                  <span className="text-zinc-800">{item.label}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Eigene Inhalte (optional)
        </p>
        {custom.map((line, i) => (
          <input
            key={i}
            type="text"
            value={line}
            onChange={(e) =>
              setCustom((prev) => {
                const next = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
            placeholder="Eigener Inhalt …"
            maxLength={160}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        ))}
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
        <p className="font-medium text-zinc-700">
          Automatisch aus dem Kurs übernommen:
        </p>
        <p className="mt-1">
          Zeitraum {formatDateDE(courseInfo.von) || "—"} bis{" "}
          {formatDateDE(courseInfo.bis) || "—"} · {courseInfo.ue} UE ·{" "}
          {courseInfo.ort || "—"}
        </p>
      </div>

      {!hasOrgSignature && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Hinweis: Noch keine erango-Unterschrift hinterlegt — zum Ausstellen
          legt der Bildungsträger sie unter „Unterschrift&ldquo; an.
        </p>
      )}

      {state?.error && (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      )}
      {state?.success && !state.error && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Gespeichert.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-50 disabled:opacity-60"
        >
          Zwischenspeichern
        </button>
        <button
          type="submit"
          name="intent"
          value="issue"
          disabled={pending || total > katalog.max}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "…" : "Bescheinigung erstellen & an erango senden"}
        </button>
      </div>
    </form>
  );
}
