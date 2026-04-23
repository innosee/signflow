"use client";

import { useMemo } from "react";

import { generateDummyResult } from "@/lib/checker/dummy-response";
import {
  MUST_HAVE_LABELS,
  type CheckerInput,
  type MustHaveTopic,
} from "@/lib/checker/types";

export function LiveFeedback({ input }: { input: CheckerInput }) {
  const hasContent =
    input.teilnahme.trim().length > 0 ||
    input.ablauf.trim().length > 0 ||
    input.fazit.trim().length > 0;

  const result = useMemo(() => {
    if (!hasContent) return null;
    return generateDummyResult(input);
  }, [input, hasContent]);

  const mustHavesMap = useMemo(() => {
    const map = new Map<MustHaveTopic, boolean>();
    if (result) {
      for (const mh of result.mustHaves) {
        map.set(mh.topic, mh.covered);
      }
    }
    return map;
  }, [result]);

  const topics = Object.keys(MUST_HAVE_LABELS) as MustHaveTopic[];
  const coveredCount = topics.filter((t) => mustHavesMap.get(t) === true).length;

  const violationCount = result?.violations.length ?? 0;
  const hasTonalityIssue = Boolean(result?.tonalityFeedback);

  return (
    <aside
      aria-label="Live-Feedback"
      className="sticky top-4 rounded-xl border border-zinc-300 bg-white p-5 text-sm shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Live-Feedback</h3>
        <span className="text-xs text-zinc-500">aktualisiert beim Tippen</span>
      </div>

      <div className="mt-4 space-y-4">
        <section>
          <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
            <span>Pflichtbausteine</span>
            <span className="font-semibold text-zinc-900">
              {coveredCount} / {topics.length}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {topics.map((topic) => {
              const covered = mustHavesMap.get(topic) === true;
              return (
                <li
                  key={topic}
                  className="flex items-start gap-2 text-xs leading-relaxed"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      covered
                        ? "bg-emerald-500 text-white"
                        : "border border-dashed border-zinc-300"
                    }`}
                  >
                    {covered && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className={covered ? "text-zinc-800" : "text-zinc-500"}>
                    {MUST_HAVE_LABELS[topic]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-t border-zinc-200 pt-4">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
            <span>Unzulässige Formulierungen</span>
            <span
              className={`font-semibold ${
                violationCount > 0 ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {violationCount}
            </span>
          </div>
          {!hasContent && (
            <p className="mt-2 text-xs text-zinc-500">
              Fang an zu schreiben — Feedback erscheint hier automatisch.
            </p>
          )}
          {hasContent && violationCount === 0 && (
            <p className="mt-2 text-xs text-emerald-700">
              Keine verbotenen Begriffe bisher erkannt.
            </p>
          )}
          {violationCount > 0 && result && (
            <ul className="mt-2 space-y-1.5">
              {result.violations.slice(0, 5).map((v) => (
                <li
                  key={v.id}
                  className="rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-900"
                >
                  <span className="font-medium">{v.rule}</span>
                  <span className="ml-1 text-rose-700">
                    — Details beim Prüfen
                  </span>
                </li>
              ))}
              {result.violations.length > 5 && (
                <li className="text-xs text-zinc-500">
                  + {result.violations.length - 5} weitere
                </li>
              )}
            </ul>
          )}
        </section>

        {hasTonalityIssue && (
          <section className="border-t border-zinc-200 pt-4">
            <div className="text-xs font-medium text-amber-800">
              Tonalitäts-Hinweis
            </div>
            <p className="mt-1 text-xs text-amber-900">
              {result?.tonalityFeedback}
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
