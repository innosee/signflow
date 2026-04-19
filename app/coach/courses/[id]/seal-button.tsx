"use client";

import { useActionState } from "react";

import { sealCourse, type SealState } from "./actions";

export function SealCourseButton({
  courseId,
  disabled,
  disabledReason,
}: {
  courseId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<SealState, FormData>(
    sealCourse,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
      >
        {pending ? "Wird gesiegelt…" : "Mit FES versiegeln"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state?.sealed && (
        <p className="text-xs text-emerald-800">
          Dokument gesiegelt. Die Firma kann es jetzt an die AfA übermitteln.
        </p>
      )}
    </form>
  );
}
