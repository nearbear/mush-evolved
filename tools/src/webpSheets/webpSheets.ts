// Generates lossless WebP copies of the largest PNG spritesheets under Mush/derived/webp/
// (CC BY-NC-SA 4.0, see Mush/ATTRIBUTION.md), leaving the original PNGs untouched.
// Run with `npm run webp-sheets` (after `npm run ship-layout` if BigFill pages change).

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
export const OUT_DIR = resolve(MUSH, "derived/webp");

/** Output stem -> source PNG path relative to Mush/. */
export const WEBP_SHEETS: Record<string, string> = {
  "BigFill-0": "derived/pages/BigFill-0.png",
  "BigFill2-0": "derived/pages/BigFill2-0.png",
  char: "www/img/art/char.png",
  gfx_01: "clients/iso/gfx/gfx_01.png",
  MidFill: "clients/iso/gfx/MidFill.png",
  MidFill2: "clients/iso/gfx/MidFill2.png",
  fx: "clients/iso/gfx/fx.png",
};

const ENCODE_PY = `
import io, json, os, sys
from PIL import Image

mush, out_dir, pairs = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
tot_png = tot_webp = 0
for stem, rel in pairs.items():
  src = os.path.join(mush, rel)
  dst = os.path.join(out_dir, f"{stem}.webp")
  im = Image.open(src).convert("RGBA")
  buf = io.BytesIO()
  im.save(buf, format="WEBP", lossless=True, quality=80, method=6)
  data = buf.getvalue()
  # Verify every visible pixel (alpha > 0) matches the source PNG exactly.
  dec = Image.open(io.BytesIO(data)).convert("RGBA")
  if dec.size != im.size:
    raise SystemExit(f"{stem}: size mismatch {dec.size} != {im.size}")
  orig_b, dec_b = im.tobytes(), dec.tobytes()
  for i in range(0, len(orig_b), 4):
    if (orig_b[i + 3] or dec_b[i + 3]) and orig_b[i:i + 4] != dec_b[i:i + 4]:
      raise SystemExit(f"{stem}: visible pixel mismatch at byte {i}")
  with open(dst, "wb") as f:
    f.write(data)
  png_sz, webp_sz = os.path.getsize(src), len(data)
  tot_png += png_sz
  tot_webp += webp_sz
  pct = 100.0 * (1.0 - webp_sz / png_sz)
  print(f"  {stem}.webp: {png_sz // 1024} KiB -> {webp_sz // 1024} KiB (-{pct:.1f}%)")
pct = 100.0 * (1.0 - tot_webp / tot_png)
print(f"Total: {tot_png // 1024} KiB -> {tot_webp // 1024} KiB (-{pct:.1f}%, saved {(tot_png - tot_webp) // 1024} KiB)")
`;

export function generateWebpSheets(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  execFileSync("python3", ["-c", ENCODE_PY, MUSH, OUT_DIR, JSON.stringify(WEBP_SHEETS)], { stdio: "inherit" });
}

if (import.meta.main) {
  generateWebpSheets();
}
