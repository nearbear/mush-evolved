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

  it("sizes the pieces for the sideways frame", () => {
    const sizes = Object.fromEntries(
      Object.entries(buildPipBar()).map(([name, svg]) => [name, /width="(\d+)" height="(\d+)"/.exec(svg)!.slice(1).join("x")]),
    );
    expect(sizes["cap-start.svg"]).toBe("3x11");
    expect(sizes["cap-end.svg"]).toBe("4x11");
    expect(sizes["slot-5.svg"]).toBe("6x11");
    expect(sizes["slot-5-thin.svg"]).toBe("4x11");
  });
});
