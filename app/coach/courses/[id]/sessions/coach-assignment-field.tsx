"use client";

/**
 * Kompetenzteams: Coach-Zuweisung pro Termin. Zeigt ein Dropdown nur, wenn der
 * Tenant überhaupt mehr als einen zuweisbaren Coach hat — bei genau einem Coach
 * (Standardfall) wird der Lead per Hidden-Input gesetzt, ohne die UI zu
 * verkomplizieren. Die Server-Action validiert den Wert in jedem Fall.
 */
export function CoachAssignmentField({
  coaches,
  defaultCoachId,
}: {
  coaches: Array<{ id: string; name: string }>;
  defaultCoachId: string;
}) {
  if (coaches.length <= 1) {
    return <input type="hidden" name="coachId" value={defaultCoachId} />;
  }
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">
        Coach für diesen Termin <span className="text-red-600">*</span>
      </span>
      <select
        name="coachId"
        defaultValue={defaultCoachId}
        required
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      >
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="text-xs text-zinc-500">
        Wer hält und unterschreibt diesen Termin? Nur der zugewiesene Coach kann
        ihn signieren.
      </span>
    </label>
  );
}
