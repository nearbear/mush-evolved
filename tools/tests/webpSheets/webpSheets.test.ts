import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OUT_DIR, WEBP_SHEETS } from "../../src/webpSheets/webpSheets.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");

describe("Mush/derived/webp spritesheets", () => {
  it("has a lossless WebP (VP8L) smaller than its source PNG for every configured sheet", () => {
    for (const [stem, rel] of Object.entries(WEBP_SHEETS)) {
      const srcPath = resolve(MUSH, rel);
      const webpPath = resolve(OUT_DIR, `${stem}.webp`);
      const bytes = readFileSync(webpPath);
      expect(bytes.subarray(0, 4).toString("ascii"), `${stem}.webp RIFF header`).toBe("RIFF");
      expect(bytes.subarray(8, 16).toString("ascii"), `${stem}.webp lossless VP8L chunk`).toBe("WEBPVP8L");
      expect(bytes.length, `${stem}.webp should be smaller than ${rel}`).toBeLessThan(statSync(srcPath).size);
    }
  });
});
