"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
    >
      Als PDF speichern
    </button>
  );
}
