import { defaultAc } from "better-auth/plugins/admin/access";

/**
 * Access-Control-Regeln für das Better-Auth Admin-Plugin — bewusst ohne
 * db-/server-only-Importe ausgelagert aus auth.ts, damit die
 * sicherheitsrelevante Rolle und die Admin-Pfad-Sperre unit-testbar sind.
 */

/**
 * Rolle des Bildungsträgers. Bewusst KEIN Voll-Admin (früher: `adminAc`, das
 * u. a. `list` / `set-password` / `delete` / `ban` / `set-role` über ALLE
 * Mandanten erlaubte — Better Auth kennt kein Tenant-Konzept). Er braucht nur
 * zwei Fähigkeiten, beide ausschließlich serverseitig über `auth.api.*` in
 * tenant-geprüften Server Actions:
 *   - `impersonate`: tenant-geprüfter Coach-Wechsel (`impersonateCoach`)
 *   - `create`:      Anlage von Coach-/BT-Team-Accounts (`auth.api.createUser`)
 * NICHT enthalten: `list`, `set-password`, `delete`, `ban`, `set-role`, `get`,
 * `update`.
 */
export const bildungstraegerAc = defaultAc.newRole({
  user: ["impersonate", "create"],
  session: [],
});

/**
 * Zweite Verteidigungslinie: die öffentlichen `/api/auth/admin/*`-HTTP-Endpoints
 * werden hart geblockt (siehe app/api/auth/[...all]/route.ts). Die App ruft sie
 * nie vom Browser — Impersonation/User-Anlage laufen über `auth.api.*`
 * serverseitig, was NICHT durch die HTTP-Route geht. So kann ein Bildungsträger
 * den Tenant-Gate der Server Action nicht per direktem POST umgehen.
 */
export function isBlockedAdminAuthPath(pathname: string): boolean {
  return pathname.includes("/api/auth/admin");
}
