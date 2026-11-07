import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPipBar, OUT_DIR } from "../../src/pipBar/pipBar.ts";

describe("pip bar pieces", () => {
  it("matches the committed SVGs (run `npm run pip-bar` if this fails)", () => {
    for (const [name, svg] of Object.entries(buildPipBar())) {
      expect(readFileSync(resolve(OUT_DIR, name), "utf8"), name).toBe(svg);
    }
  });
});
