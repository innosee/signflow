import { describe, expect, it } from "vitest";

import { bildungstraegerAc, isBlockedAdminAuthPath } from "./auth-access";

/**
 * Regression zu PR #137 (docs/test-plan-access-control.md §C/§G):
 * Der Bildungsträger darf serverseitig genau `impersonate` + `create` und
 * sonst NICHTS. Und die öffentliche Admin-HTTP-Fläche wird als solche erkannt
 * (→ 404). Beides zusammen schließt die Cross-Tenant-Übernahme.
 */

type UserAction =
  | "create"
  | "list"
  | "set-role"
  | "ban"
  | "impersonate"
  | "impersonate-admins"
  | "delete"
  | "set-password"
  | "get"
  | "update";

function may(action: UserAction): boolean {
  return bildungstraegerAc.authorize({ user: [action] }).success;
}

describe("bildungstraegerAc – Rolle ist entprivilegiert", () => {
  it("erlaubt genau impersonate + create (von den Server Actions gebraucht)", () => {
    expect(may("impersonate")).toBe(true);
    expect(may("create")).toBe(true);
  });

  it("verweigert alle gefährlichen Fähigkeiten (Cross-Tenant-Vektoren)", () => {
    const forbidden: UserAction[] = [
      "list", // User-Enumeration über alle Mandanten
      "set-password", // Fremd-Account-Übernahme
      "delete",
      "ban",
      "set-role",
      "get",
      "update",
    ];
    for (const action of forbidden) {
      expect(may(action), `darf NICHT: ${action}`).toBe(false);
    }
  });
});

describe("isBlockedAdminAuthPath – Admin-HTTP-Fläche gesperrt", () => {
  it("blockt alle /api/auth/admin/*-Endpoints", () => {
    for (const p of [
      "/api/auth/admin/list-users",
      "/api/auth/admin/impersonate-user",
      "/api/auth/admin/create-user",
      "/api/auth/admin/set-user-password",
      "/api/auth/admin/remove-user",
      "/api/auth/admin/set-role",
    ]) {
      expect(isBlockedAdminAuthPath(p), `blockt: ${p}`).toBe(true);
    }
  });

  it("lässt die normalen Auth-Endpoints durch", () => {
    for (const p of [
      "/api/auth/sign-in/email",
      "/api/auth/sign-out",
      "/api/auth/get-session",
      "/api/auth/reset-password",
      "/api/auth/forget-password",
    ]) {
      expect(isBlockedAdminAuthPath(p), `erlaubt: ${p}`).toBe(false);
    }
  });
});
