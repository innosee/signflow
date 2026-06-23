import { defineConfig } from "vitest/config";

// Unit-Tests für reine Domänen-Logik. Bewusst eng auf `*.test.ts` in src/
// gescoped — die getesteten Module dürfen KEINE DB-/server-only-Importe haben
// (sonst zieht der Test ein gesetztes DATABASE_URL nach sich).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
