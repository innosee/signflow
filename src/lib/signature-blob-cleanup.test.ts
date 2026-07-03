import { describe, expect, it } from "vitest";

import { shouldDeleteReplacedSignatureBlob } from "./signature-blob-cleanup";

/**
 * Regression zu PR #136 (docs/test-plan-access-control.md §G):
 * Der alte Signatur-Blob darf beim Re-Upload NUR gelöscht werden, wenn keine
 * signatures-Zeile ihn mehr referenziert — sonst gehen die Unterschriften in
 * bestehenden (ggf. abgeschlossenen) Nachweisen verloren.
 */
describe("shouldDeleteReplacedSignatureBlob", () => {
  it("löscht NICHT, wenn der alte Blob noch als Snapshot referenziert wird (der Bug-Fix)", () => {
    expect(
      shouldDeleteReplacedSignatureBlob({
        previousUrl: "signatures/user-1/old.png",
        newUrl: "signatures/user-1/new.png",
        isStillReferenced: true,
      }),
    ).toBe(false);
  });

  it("löscht, wenn der alte Blob ein echter Waise ist (nicht mehr referenziert)", () => {
    expect(
      shouldDeleteReplacedSignatureBlob({
        previousUrl: "signatures/user-1/old.png",
        newUrl: "signatures/user-1/new.png",
        isStillReferenced: false,
      }),
    ).toBe(true);
  });

  it("löscht NICHT beim Erst-Upload (kein Vorgänger)", () => {
    expect(
      shouldDeleteReplacedSignatureBlob({
        previousUrl: null,
        newUrl: "signatures/user-1/new.png",
        isStillReferenced: false,
      }),
    ).toBe(false);
    expect(
      shouldDeleteReplacedSignatureBlob({
        previousUrl: undefined,
        newUrl: "signatures/user-1/new.png",
        isStillReferenced: false,
      }),
    ).toBe(false);
  });

  it("löscht NICHT, wenn sich der Wert nicht geändert hat (idempotenter Re-Save)", () => {
    expect(
      shouldDeleteReplacedSignatureBlob({
        previousUrl: "signatures/user-1/same.png",
        newUrl: "signatures/user-1/same.png",
        isStillReferenced: false,
      }),
    ).toBe(false);
  });
});
