"use client";

import { useActionState } from "react";

import { resendInviteAsSms, type SmsResendState } from "./actions";

/**
 * Inline-Button in der TN-Zeile: löst manuell einen Magic-Link-Versand
 * per SMS für genau diesen Teilnehmer aus. Bewusst nicht im Bulk-Notify
 * mit drin — SMS ist die Coach-getriggerte Reaktion auf einen stillen
 * TN, nicht das Default-Versandverhalten.
 *
 * Sichtbarkeit liegt beim Parent: rendered nur, wenn `SMS_ENABLED` UND
 * der TN eine Mobilnummer hat. Server-Action prüft beides nochmal hart
 * (Defense-in-Depth gegen veraltete Browser-Tabs nach Flag-Off).
 */
export function SmsResendButton({
  courseId,
  participantId,
  phone,
}: {
  courseId: string;
  participantId: string;
  /**
   * E.164-Nummer, nur zur Anzeige im Confirm-Title. Server-Action holt
   * sich die Wahrheit selbst aus der DB.
   */
  phone: string;
}) {
  const [state, action, pending] = useActionState<SmsResendState, FormData>(
    resendInviteAsSms,
    undefined,
  );

  return (
    <form action={action} className="inline-flex flex-col items-end gap-0.5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="participantId" value={participantId} />
      <button
        type="submit"
        disabled={pending}
        title={`Magic-Link per SMS an ${phone} senden (Kosten ca. 8 Cent)`}
        className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-900 transition hover:bg-sky-100 disabled:opacity-40"
      >
        <span aria-hidden="true">📱</span>
        {pending ? "Wird gesendet…" : state?.success ? "SMS gesendet ✓" : "SMS senden"}
      </button>
      {state?.error && (
        <span role="alert" className="text-[10px] text-red-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
