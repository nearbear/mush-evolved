// Writes Mush/derived/data/<file>/<sheet>.json for every sheet of every
// Mush/data/*.ods, so the original game's design tables can be searched and
// diffed as plain text. A sheet whose first row is a header of unique,
// non-empty names becomes an array of objects keyed by it; any other sheet
// stays an array of rows.
//
// Run with `npm run ods-data` after changing files in Mush/data/.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { readOds } from "./ods.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
const INPUT = resolve(MUSH, "data");
const OUTPUT = resolve(MUSH, "derived/data");

function toJson(rows: string[][]): string {
  const [header = [], ...rest] = rows;
  const keyed = header.length > 0 && header.every((h) => h !== "") && new Set(header).size === header.length;
  const data = keyed ? rest.map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""]))) : rows;
  return `${JSON.stringify(data, null, 1)}\n`;
}

rmSync(OUTPUT, { recursive: true, force: true });
let count = 0;
for (const file of readdirSync(INPUT).filter((f) => f.endsWith(".ods")).sort()) {
  const dir = resolve(OUTPUT, basename(file, ".ods"));
  mkdirSync(dir, { recursive: true });
  for (const sheet of readOds(readFileSync(resolve(INPUT, file)))) {
    const safe = sheet.name.replace(/[^\w.-]+/g, "_");
    writeFileSync(resolve(dir, `${safe}.json`), toJson(sheet.rows));
    count++;
  }
}
console.log(`Wrote ${count} sheets to ${relative(process.cwd(), OUTPUT)}`);
