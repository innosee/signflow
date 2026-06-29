import { describe, expect, it } from "vitest";

import {
  activeHardBlocks,
  isHardBlockDismissed,
  resolveHardBlockOverrideReason,
} from "./gate";
import type { CheckerResult, Violation } from "./types";

function violation(over: Partial<Violation> & { id: string }): Violation {
  return {
    category: "medizin",
    severity: "hard_block",
    section: "fazit",
    quote: "Burnout",
    rule: "Diagnosen unzulässig",
    suggestion: "…",
    ...over,
  };
}

function result(violations: Violation[]): CheckerResult {
  return { status: "needs_revision", mustHaves: [], violations };
}

describe("isHardBlockDismissed", () => {
  it("nur ab ≥10 Zeichen Begründung weggeklickt", () => {
    expect(isHardBlockDismissed("a", {})).toBe(false);
    expect(isHardBlockDismissed("a", { a: "zu kurz" })).toBe(false);
    expect(isHardBlockDismissed("a", { a: "  ausreichend lang  " })).toBe(true);
  });
});

describe("activeHardBlocks", () => {
  it("zählt nur hard_blocks ohne ausreichende Begründung", () => {
    const r = result([
      violation({ id: "a" }),
      violation({ id: "b" }),
      violation({ id: "c", severity: "soft_flag" }),
    ]);
    expect(activeHardBlocks(r, {}).map((v) => v.id)).toEqual(["a", "b"]);
    expect(
      activeHardBlocks(r, { a: "Fehlalarm, Satz ist positiv" }).map(
        (v) => v.id,
      ),
    ).toEqual(["b"]);
    expect(
      activeHardBlocks(r, {
        a: "Fehlalarm, Satz ist positiv",
        b: "kein Gesundheitsbezug hier",
      }),
    ).toEqual([]);
  });

  it("ignoriert soft_flags völlig", () => {
    const r = result([violation({ id: "s", severity: "soft_flag" })]);
    expect(activeHardBlocks(r, {})).toEqual([]);
  });

  it("ein übernommener Vorschlag (appliedIds) löst den Hard-Block auf", () => {
    const r = result([violation({ id: "a" }), violation({ id: "b" })]);
    expect(activeHardBlocks(r, {}, new Set(["a"])).map((v) => v.id)).toEqual([
      "b",
    ]);
    expect(activeHardBlocks(r, {}, new Set(["a", "b"]))).toEqual([]);
  });
});

describe("resolveHardBlockOverrideReason", () => {
  it("führt die Begründungen weggeklickter Stellen zusammen", () => {
    const r = result([
      violation({ id: "a", quote: "Depression" }),
      violation({ id: "b", quote: "Burnout" }),
    ]);
    const reason = resolveHardBlockOverrideReason(r, {
      a: "Fehlalarm, nur zitiert",
      b: "kurz", // < 10 → nicht weggeklickt, nicht aufgenommen
    });
    expect(reason).toContain("Fehlalarm-Begründung");
    expect(reason).toContain("Depression");
    expect(reason).toContain("Fehlalarm, nur zitiert");
    expect(reason).not.toContain("Burnout");
  });

  it("gibt null zurück, wenn nichts weggeklickt ist", () => {
    const r = result([violation({ id: "a" })]);
    expect(resolveHardBlockOverrideReason(r, {})).toBeNull();
    expect(resolveHardBlockOverrideReason(r, { a: "kurz" })).toBeNull();
  });

  it("kürzt auf max. 500 Zeichen", () => {
    const r = result([violation({ id: "a", quote: "x".repeat(400) })]);
    const reason = resolveHardBlockOverrideReason(r, { a: "y".repeat(400) });
    expect(reason!.length).toBeLessThanOrEqual(500);
  });
});
