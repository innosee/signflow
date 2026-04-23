"use client";

import { useActionState } from "react";

import { submitCourseToAfa, type SubmitAfaState } from "../actions";

export function SubmitAfaButton({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<SubmitAfaState, FormData>(
    submitCourseToAfa,
    undefined,
  );

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {pending ? "Wird übermittelt…" : "An AfA übermitteln"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
