/**
 * Zentrale Feature-Flags. Bewusst plain consts (kein Env-Lookup), damit sie in
 * Server-Actions UND Client-Komponenten importierbar sind und im Build inlinen.
 */

/**
 * AfA-„übermittelt"-Markierung. Bewusst ein MANUELLER Status-Haken: der BT
 * übermittelt händisch außerhalb der App und markiert den Nachweis danach als
 * übermittelt, damit er visuell abgeschlossen ist — KEIN automatischer Versand.
 * Der echte Versand kommt später mit dem Rechnungs-Feature (Phase 2).
 *
 * Kill-Switch: auf `false` setzen, um die Markierung temporär zu sperren (z.B.
 * nach versehentlichen Klicks). Der Button hat zusätzlich einen Bestätigungs-
 * schritt gegen Fehlklicks.
 */
export const AFA_SUBMISSION_ENABLED = true;
