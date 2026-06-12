const REVIEW_NOTE_KIND_LABEL: Record<string, string> = {
  submit: "Eingereicht",
  approve: "Freigegeben",
  changes: "Nachbesserung",
  comment: "Notiz",
};

export type ReviewNote = {
  id: string;
  authorType: "coach" | "bildungstraeger";
  authorName: string;
  kind: "submit" | "approve" | "changes" | "comment";
  body: string | null;
  createdAt: Date;
};

/**
 * Verlauf der Bildungsträger-Prüfung (Coach ↔ Bildungsträger). Append-only,
 * chronologisch. Nachbesserungs-Einträge (`changes`) werden hervorgehoben,
 * Freigaben (`approve`) grün. Geteilt zwischen Coach-Kursseite und
 * BT-Prüfseite.
 */
export function ReviewThread({ notes }: { notes: ReviewNote[] }) {
  if (notes.length === 0) return null;
  return (
    <ol className="space-y-2">
      {notes.map((n) => {
        const isChanges = n.kind === "changes";
        const isApprove = n.kind === "approve";
        return (
          <li
            key={n.id}
            className={`rounded-lg border px-3 py-2 text-xs ${
              isChanges
                ? "border-amber-300 bg-amber-50"
                : isApprove
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-zinc-500">
              <span className="font-medium text-zinc-700">{n.authorName}</span>
              <span>
                ·{" "}
                {n.authorType === "bildungstraeger" ? "Bildungsträger" : "Coach"}
              </span>
              <span>· {REVIEW_NOTE_KIND_LABEL[n.kind] ?? n.kind}</span>
              <span>· {new Date(n.createdAt).toLocaleString("de-DE")}</span>
            </div>
            {n.body && (
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">{n.body}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
