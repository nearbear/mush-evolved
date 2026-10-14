// Renders labeled contact sheets of an image folder in headless Chromium, so
// art can be looked at without image tools (WSL has none installed).
//
//   npm run contact-sheet -- Mush/www/img/design
//   npm run contact-sheet -- Mush/www/img/design --match "^but" --zoom 4 --bg "#0d1424"
//
// Each sheet is a PNG in --out (default .screenshots/contact/), one cell per
// image over a checkerboard so transparency shows. Prints each sheet's path,
// then each image's natural size (WxH), which reading the file can't give us.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots/contact") },
    /** Regex on file names. */
    match: { type: "string", default: "" },
    /** Images per sheet. */
    per: { type: "string", default: "36" },
    /** Pixel zoom (nearest-neighbor). 0 = fit each image in a 420x260 cell. */
    zoom: { type: "string", default: "0" },
    bg: { type: "string", default: "#808080" },
  },
});

const repoRoot = resolve(import.meta.dirname, "../../..");
const dir = positionals[0] ? resolve(repoRoot, positionals[0]) : undefined;
if (!dir) {
  console.error("Usage: npm run contact-sheet -- <folder> [--match regex] [--zoom n] [--per n] [--bg color] [--out dir]");
  process.exit(2);
}

const pattern = new RegExp(args.match!);
const files = readdirSync(dir)
  .filter((f) => /\.(png|gif|jpe?g)$/i.test(f) && pattern.test(f))
  .sort();
if (files.length === 0) {
  console.error(`No images in ${dir} matching /${args.match}/`);
  process.exit(1);
}

const out = resolve(repoRoot, args.out!);
mkdirSync(out, { recursive: true });
const per = Number(args.per);
const zoom = Number(args.zoom);
const imgStyle = zoom > 0 ? `zoom:${zoom}` : "max-width:420px;max-height:260px;min-width:24px;min-height:12px";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
try {
  for (let i = 0; i < files.length; i += per) {
    const cells = files
      .slice(i, i + per)
      .map((f) => `<figure><img src="${pathToFileURL(resolve(dir, f)).href}"><figcaption>${f}</figcaption></figure>`)
      .join("");
    const html = `<!doctype html><style>
      body{margin:8px;font:12px sans-serif;background:${args.bg};display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
      figure{margin:0;border:1px solid #f0f;padding:4px;background:repeating-conic-gradient(#999 0 25%,#bbb 0 50%) 0 0/16px 16px}
      img{display:block;image-rendering:pixelated;${imgStyle}}
      figcaption{background:#000;color:#ff0;padding:1px 3px}</style>${cells}`;
    // file:// images only load from a file:// page, not from setContent.
    const htmlPath = resolve(out, "sheet.html");
    writeFileSync(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href);
    const png = resolve(out, `${basename(dir)}-${String(i / per).padStart(2, "0")}.png`);
    await page.screenshot({ path: png, fullPage: true });
    console.log(png);
    const sizes = await page.$$eval("figure", (figs) =>
      figs.map((f) => `${f.querySelector("figcaption")!.textContent}\t${f.querySelector("img")!.naturalWidth}x${f.querySelector("img")!.naturalHeight}`),
    );
    for (const line of sizes) console.log(`  ${line}`);
  }
} finally {
  await browser.close();
}
