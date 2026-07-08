import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { isBlockedAdminAuthPath } from "@/lib/auth-access";

const handler = toNextJsHandler(auth);

/**
 * Die Admin-Endpoints des Better-Auth-Plugins (`/api/auth/admin/*`:
 * list-users, impersonate-user, create-user, set-user-password, remove-user,
 * set-role, ban-user, …) werden NIE vom Browser aufgerufen. Impersonation und
 * User-Anlage laufen ausschließlich über tenant-geprüfte Server Actions, die
 * `auth.api.*` serverseitig aufrufen — das geht NICHT durch diese HTTP-Route.
 *
 * Ohne diese Sperre könnte jeder eingeloggte Bildungsträger per direktem POST
 * an `/api/auth/admin/impersonate-user` bzw. `/create-user` den Tenant-Gate der
 * Server Action umgehen und cross-tenant agieren (Better Auth kennt kein
 * Tenant-Konzept). Deshalb: harte 404 auf die gesamte Admin-Fläche.
 * Die Pfad-Regel liegt (unit-getestet) in `isBlockedAdminAuthPath`.
 */
function isBlockedAdminPath(req: Request): boolean {
  return isBlockedAdminAuthPath(new URL(req.url).pathname);
}

export async function GET(req: Request): Promise<Response> {
  if (isBlockedAdminPath(req)) {
    return new Response("Not Found", { status: 404 });
  }
  return handler.GET(req);
}

export async function POST(req: Request): Promise<Response> {
  if (isBlockedAdminPath(req)) {
    return new Response("Not Found", { status: 404 });
  }
  return handler.POST(req);
}
