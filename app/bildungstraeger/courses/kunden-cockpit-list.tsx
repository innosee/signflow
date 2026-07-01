"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

import { ANW_TONE_BADGE, type AnwTone } from "@/lib/anw-status";
import { track } from "@/lib/analytics";

import { archiveCourse, setCourseBewilligt, unarchiveCourse } from "./actions";
import { DeleteCourseButton } from "./delete-course-button";

const BER_BADGE: Record<CockpitRow["berStatus"], { label: string; cls: string }> =
  {
    submitted: { label: "BER eingereicht", cls: "bg-emerald-100 text-emerald-800" },
    draft: { label: "BER Entwurf", cls: "bg-amber-100 text-amber-800" },
    missing: { label: "BER fehlt", cls: "bg-zinc-100 text-zinc-600" },
  };

export type CockpitRow = {
  id: string;
  participantName: string;
  title: string;
  kundenNr: string;
  coachName: string;
  bedarfstraegerName: string;
  status: string;
  statusLabel: string;
  isArchived: boolean;
  bewilligt: boolean;
  avgsStageLabel: string | null;
  avgsStageBadge: string | null;
  // ANW / Stundennachweis
  anwLabel: string;
  anwTone: AnwTone;
  anwPdfUrl: string | null;
  afaSubmitted: boolean;
  // Abschlussbericht
  berStatus: "missing" | "draft" | "submitted";
  berId: string | null;
};

export function KundenCockpitList({ rows }: { rows: CockpitRow[] }) {
  const [query, setQuery] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [bedarfstraegerFilter, setBedarfstraegerFilter] = useState("");

  // Such-Event entkoppelt vom Tippen: erst ~600 ms nach der letzten Eingabe
  // feuern (sonst ein Event pro Tastendruck → Analytics-Kontingent). Nur ab
  // 2 Zeichen. q landet automatisch in der Query-Spalte des Dashboards.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) return;
    searchTimer.current = setTimeout(() => track("search", { q }), 600);
  };

  // Filter-Optionen aus den vorhandenen Zeilen ableiten (eindeutig, alphabetisch)
  // — kein zusätzlicher Server-Query nötig, die Namen stehen pro Zeile bereit.
  const coachOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.coachName).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [rows],
  );
  const bedarfstraegerOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.bedarfstraegerName).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (coachFilter && r.coachName !== coachFilter) return false;
      if (bedarfstraegerFilter && r.bedarfstraegerName !== bedarfstraegerFilter)
        return false;
      if (!q) return true;
      return [
        r.participantName,
        r.title,
        r.kundenNr,
        r.coachName,
        r.bedarfstraegerName,
        r.statusLabel,
        r.anwLabel,
        BER_BADGE[r.berStatus].label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, coachFilter, bedarfstraegerFilter]);

  const filtersActive = Boolean(
    query.trim() || coachFilter || bedarfstraegerFilter,
  );

  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <div className="space-y-2 border-b border-zinc-200 px-6 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Suche nach Kunde, Kunden-Nr., Coach, Status …"
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            aria-label="Nach Coach filtern"
            className="w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black sm:w-1/2"
          >
            <option value="">Alle Coaches</option>
            {coachOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={bedarfstraegerFilter}
            onChange={(e) => setBedarfstraegerFilter(e.target.value)}
            aria-label="Nach Bedarfsträger filtern"
            className="w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black sm:w-1/2"
          >
            <option value="">Alle Bedarfsträger</option>
            {bedarfstraegerOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-zinc-500">
          Noch keine Kunden. Lege den ersten an, um loszulegen.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-zinc-500">
          {filtersActive
            ? "Keine Treffer für die aktuelle Auswahl."
            : "Keine Kunden."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200">
          {filtered.map((c) => {
            const ber = BER_BADGE[c.berStatus];
            return (
              <li key={c.id} className="px-6 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="font-medium">
                      {c.participantName}{" "}
                      <span className="text-zinc-400">·</span>{" "}
                      <span className="font-normal text-zinc-600">
                        {c.title}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      Kd-Nr. {c.kundenNr} · Coach: {c.coachName} ·{" "}
                      {c.bedarfstraegerName}
                    </div>

                    {/* Status-Matrix: ANW (Stundennachweis) + BER + AfA */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ANW_TONE_BADGE[c.anwTone]}`}
                        title="Stand der Anwesenheitsliste (Stundennachweis)"
                      >
                        ANW: {c.anwLabel}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ber.cls}`}
                        title="Stand des Abschlussberichts"
                      >
                        {ber.label}
                      </span>
                      {c.afaSubmitted && (
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                          an AfA übermittelt
                        </span>
                      )}
                      {c.avgsStageLabel && c.avgsStageBadge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${c.avgsStageBadge}`}
                        >
                          {c.avgsStageLabel}
                        </span>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {c.statusLabel}
                      </span>
                    </div>

                    {/* Downloads für den Versand ans Jobcenter / die AfA */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {c.anwPdfUrl ? (
                        <a
                          href={c.anwPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                        >
                          ↓ ANW-PDF (gesiegelt)
                        </a>
                      ) : (
                        <span className="text-zinc-400">
                          ANW-PDF erst nach Siegel
                        </span>
                      )}
                      {c.berStatus === "submitted" && c.berId ? (
                        <a
                          href={`/api/bildungstraeger/abschlussberichte/${c.berId}/pdf`}
                          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                        >
                          ↓ BER-PDF
                        </a>
                      ) : (
                        <span className="text-zinc-400">
                          BER-PDF erst nach Einreichung
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Verwaltung des Kunden */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Schnell-Umschalter für den Bewilligungsstatus. */}
                    <form action={setCourseBewilligt}>
                      <input type="hidden" name="courseId" value={c.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={c.bewilligt ? "0" : "1"}
                      />
                      <button
                        type="submit"
                        title={
                          c.bewilligt
                            ? "Bewilligung zurücknehmen (Status wieder „ausstehend“)"
                            : "Als bewilligt markieren"
                        }
                        className={
                          c.bewilligt
                            ? "rounded-lg border border-green-500 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
                            : "rounded-lg border border-green-500 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                        }
                      >
                        {c.bewilligt ? "✓ Bewilligt" : "Bewilligt setzen"}
                      </button>
                    </form>
                    <Link
                      href={`/bildungstraeger/courses/${c.id}/berichte`}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Berichte
                    </Link>
                    <Link
                      href={`/bildungstraeger/courses/${c.id}/edit`}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Bearbeiten
                    </Link>
                    {c.isArchived ? (
                      <form action={unarchiveCourse}>
                        <input type="hidden" name="courseId" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                        >
                          Wiederherstellen
                        </button>
                      </form>
                    ) : (
                      <form action={archiveCourse}>
                        <input type="hidden" name="courseId" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                        >
                          Archivieren
                        </button>
                      </form>
                    )}
                    <DeleteCourseButton
                      courseId={c.id}
                      participantName={c.participantName}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
