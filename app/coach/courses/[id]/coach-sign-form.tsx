"use client";

import { useActionState } from "react";

import { signSessionAsCoach, type SignSessionState } from "./actions";

export function CoachSignForm({
  courseId,
  sessionId,
}: {
  courseId: string;
  sessionId: string;
}) {
  const [state, action, pending] = useActionState<SignSessionState, FormData>(
    signSessionAsCoach,
    undefined,
  );

  return (
    <form action={action} className="flex items-start gap-3">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className="flex items-start gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          name="confirm"
          required
          className="mt-0.5"
        />
        <span>Ich bestätige diese Einheit.</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {pending ? "…" : "Signieren"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
