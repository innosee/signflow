/**
 * Zentrale Feature-Flags. Bewusst plain consts (kein Env-Lookup), damit sie in
 * Server-Actions UND Client-Komponenten importierbar sind und im Build inlinen.
 */

/**
 * AfA-Übermittlung. Vorübergehend deaktiviert, nachdem eine versehentliche
 * (rein dokumentarische) Übermittlung ausgelöst wurde — der echte Versand-/
 * Rechnungs-Flow ist noch nicht gebaut. Auf `true` setzen, sobald die
 * tatsächliche Übermittlung (Anhang an den Bedarfsträger / Portal-Upload)
 * implementiert und abgesichert ist.
 */
export const AFA_SUBMISSION_ENABLED = false;
