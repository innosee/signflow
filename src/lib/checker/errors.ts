/**
 * Wird von `anonymize` und `runCheck` geworfen, wenn der Server eine
 * 401 zurückgibt — typischer Fall: Session abgelaufen (12h Hard-Cap)
 * während der Tab offen liegen geblieben ist.
 *
 * UI-Komponenten checken `err instanceof AuthRequiredError` und zeigen
 * statt einer generischen Fehlermeldung einen klaren „Bitte neu
 * einloggen"-Hinweis mit Button auf `/login`.
 */
export class AuthRequiredError extends Error {
  constructor(message = "Session abgelaufen — bitte neu einloggen.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}
