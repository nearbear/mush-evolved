// Prints the parts of Mush/derived/ship-art.json and ship-map.json that match a pattern, so they can
// be searched without reading the whole files (project settings deny reading them directly).
//
// Usage: npm run layout-query -- <regex>   (case-insensitive; matched against slice names,
// equipment ids, and room ids). Output is capped at MAX_LINES.

import { readShip } from "./shipMap.ts";

const MAX_LINES = 60;

const pattern = process.argv[2];
if (!pattern) {
  console.error("Usage: npm run layout-query -- <regex>");
  process.exit(1);
}
const re = new RegExp(pattern, "i");
const layout = readShip();

const lines: string[] = [];
for (const [name, s] of Object.entries(layout.slices)) {
  if (!re.test(name)) continue;
  const extra = [s.footprint && `footprint ${s.footprint.join("x")}`, s.flags.length > 0 && `flags ${s.flags.join(",")}`, s.states && `states ${JSON.stringify(s.states)}`];
  lines.push(`slice ${name}: ${s.width}x${s.height}, ${s.framesX * s.framesY} frames${extra.filter(Boolean).map((e) => `, ${e}`).join("")}`);
}
for (const b of layout.autoBind) if (re.test(b.id) || re.test(b.tile)) lines.push(`autoBind ${b.id} -> ${b.tile}`);
for (const room of layout.rooms) {
  const roomMatches = re.test(room.id);
  room.tiles.forEach((t, i) => {
    if (re.test(t.slice) || (roomMatches && t.kind === "entity")) lines.push(`tile ${room.id} #${i}: ${t.slice} frame ${t.frame} at (${t.x},${t.y}) ${t.kind} layer ${t.layer}`);
  });
  for (const b of room.equipment) {
    if (re.test(b.id) || re.test(b.tile) || roomMatches) lines.push(`binding ${room.id}: ${b.key ?? b.id} (${b.id}) -> ${b.tile}${b.data ? ` data ${b.data}` : ""}`);
  }
}

for (const line of lines.slice(0, MAX_LINES)) console.log(line);
if (lines.length > MAX_LINES) console.log(`... ${lines.length - MAX_LINES} more; narrow the pattern`);
if (lines.length === 0) console.log("No matches.");
