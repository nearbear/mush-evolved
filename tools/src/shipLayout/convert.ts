// Build-time converter: Motion Twin's tiles.xml -> ship-art.json (the sprites: sheets, slices,
// animations). Cuts sheets too big for a GPU texture into pages under derived/pages/ (see
// pages.ts), and writes ship-plan.json, the minimap's deck plan (see shipPlan.ts), and
// ship-rooms.json, the room graph for the rules, read from the hand-edited ship-map.json.
//
// Run with `npm run ship-layout`. Reproduces how the original Flash client read tiles.xml
// (clients/iso/src/Data.hx `addToStore`), so comments cite its functions. The rooms used to be
// converted from ShipMap.png here too; they were frozen into ship-map.json on 2026-10-21 and are
// edited there now.
//
// The output is derived from CC BY-NC-SA material, so it is written into the
// Mush/ tree, not into our code.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SheetInfo, ShipArt, ShipMap, ShipRoom, SliceInfo } from "@mush2/shared";
// The leaf module, not the package index: the index loads config.ts, which reads the file this tool writes.
import { placedEquipment } from "../../../shared/src/shipLayout.ts";
import { EQUIPMENT_TYPES } from "../../../shared/src/equipment.ts";
import { decodePng, encodePng, pngSize } from "./png.ts";
import { buildPage, pageSheets } from "./pages.ts";
import { cachedPlan, convertShipPlan, formatShipPlan } from "./shipPlan.ts";
import { child, childrenNamed, parseXml, type XmlElement } from "./xml.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
const ISO = "clients/iso";
const OUTPUT = resolve(MUSH, "derived/ship-art.json");
const MAP = resolve(MUSH, "derived/ship-map.json");
const ROOMS_OUTPUT = resolve(MUSH, "derived/ship-rooms.json");
const PLAN_OUTPUT = resolve(MUSH, "derived/ship-plan.json");

/**
 * Flash class name -> image. The build file that bound these is not in the
 * archive; matched by image size against slice extents, and for BmpGfx2 by
 * eye (floor tiles at 0,0 and door strips at y=305 are in gfx_01.png).
 * Transparent colors are the `makeTransp` calls in Data.hx (Flash ARGB).
 */
const SHEETS: Record<string, { file: string; transparentArgb?: number }> = {
  BmpGfx2: { file: "gfx_01.png" },
  BmpGfxFx: { file: "fx.png", transparentArgb: 0x00000000 },
  BmpGfxChar: { file: "char.png", transparentArgb: 0xffffffff },
  BmpSmallFill: { file: "SmallFill.png" },
  BmpMidFill: { file: "MidFill.png" },
  BmpMidFill2: { file: "MidFill2.png" },
  BmpBigFill: { file: "BigFill.png" },
  BmpBigFill2: { file: "BigFill2.png" },
  BmpGfxDev: { file: "dev.png" },
  BmpMasks: { file: "Masks.png" },
};

/**
 * The RoomId enum, which is the `rooms` sheet of data/Data.ods: Map.hx's serialized plan indexes
 * rooms by it. Stops at OUTER_SPACE: later rows don't match this snapshot of Data.ods.
 */
export const ROOM_IDS = [
  "COMMAND_CENTER", "SPACESHIP_BAY_A", "SPACESHIP_BAY_B", "SPACESHIP_BAY_AA", "NEXUS_ROOM", "SICK_BAY", "LABORATORY",
  "REFECTORY", "HYDROPONIC_CENTER", "MOTOR_ROOM", "LASER_TURRET_A_0", "LASER_TURRET_A_1", "LASER_TURRET_A_2",
  "LASER_TURRET_B_0", "LASER_TURRET_B_1", "LASER_TURRET_B_2", "PATROL_SHIP_A_0", "PATROL_SHIP_A_1", "PATROL_SHIP_A_2",
  "PATROL_SHIP_B_0", "PATROL_SHIP_B_1", "PATROL_SHIP_B_2", "PATROL_SHIP_AA_0", "PATROL_SHIP_AA_1", "CORRIDOR_A",
  "CORRIDOR_B", "CORRIDOR_C", "PLANET", "ICARUS", "BEDROOM_A", "BEDROOM_B", "STORAGE_FRONT", "STORAGE_A_0",
  "STORAGE_A_1", "STORAGE_B_0", "STORAGE_B_1", "OUTER_SPACE",
];

export function convert(tilesXml: string, sheetSize: (file: string) => { width: number; height: number }): ShipArt {
  const xml = parseXml(tilesXml);
  const data = child(xml, "data") ?? fail("tiles.xml: missing <data>");

  const sheets: Record<string, SheetInfo> = {};
  const slices: Record<string, SliceInfo> = {};
  for (const sheetEl of childrenNamed(child(data, "tiles") ?? fail("missing <tiles>"), "sheet")) {
    const name = sheetEl.attrs.src!;
    const known = SHEETS[name] ?? fail(`unknown sheet ${name}`);
    const image = `${ISO}/gfx/${known.file}`;
    const dims = sheetSize(image);
    sheets[name] = {
      image,
      ...dims,
      ...(known.transparentArgb !== undefined && { transparentColor: argbToRgba(known.transparentArgb) }),
    };
    for (const s of childrenNamed(sheetEl, "slice")) {
      const slice = parseSlice(name, s);
      if (slices[s.attrs.id!]) fail(`duplicate slice id ${s.attrs.id}`);
      if (slice.x + slice.width * slice.framesX > dims.width || slice.y + slice.height * slice.framesY > dims.height) {
        fail(`slice ${s.attrs.id} extends past ${image} (${dims.width}x${dims.height})`);
      }
      slices[s.attrs.id!] = slice;
    }
  }

  const extras = child(data, "extras") ?? fail("missing <extras>");
  const autoBind = childrenNamed(child(extras, "autoBind") ?? fail("missing <autoBind>"), "eq").map((e) => ({
    id: e.attrs.id!,
    tile: e.attrs.tile!,
  }));
  for (const ref of autoBind) if (!slices[ref.tile]) fail(`equipment ${ref.id} references unknown slice ${ref.tile}`);
  return { sheets, slices, autoBind };
}

/**
 * Offsets tiles.xml gets wrong, by slice. The original only ever placed `sofa` (one turret room), so its mirror
 * `sofaReverse` kept an untuned `ofs="0,0"`, which drew it about a cell down-right of its footprint. Mirrored: the
 * footprint's middle is at -16 px of the anchor instead of +16, so the art goes where `sofa`'s does, mirrored.
 */
const OFFSET_FIXES: Readonly<Record<string, [number, number]>> = { sofaReverse: [-14, -16] };

function parseSlice(sheet: string, s: XmlElement): SliceInfo {
  const p = s.attrs.params!.split(",").map((v) => Number.parseInt(v.trim(), 10));
  // Data.addToStore defaults: missing or unparsable frame counts become 1.
  const count = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? 1 : v);
  const ofs = (s.attrs.ofs ?? "").split(",").map((v) => Number.parseInt(v.trim(), 10));
  const dep = child(s, "dep");
  const pad = child(s, "modulePad");
  const states = childrenNamed(s, "state");

  return {
    sheet,
    x: p[0]!,
    y: p[1]!,
    width: p[2]!,
    height: p[3]!,
    framesX: count(p[4]),
    framesY: count(p[5]),
    flipX: s.attrs.flipX === "true",
    flipY: s.attrs.flipY === "true",
    rot: s.attrs.rot ? int(s.attrs.rot) : 0,
    offset: OFFSET_FIXES[s.attrs.id!] ?? [ofs[0] || 0, ofs[1] || 0],
    flags: (s.attrs.data ?? "")
      .split(",")
      .map((f) => f.trim().toLowerCase().replace(/^_/, ""))
      .filter(Boolean),
    ...(dep && { footprint: pair(dep.text) }),
    frames: childrenNamed(s, "frame").map((f) => ({
      ...(f.attrs.color && { color: f.attrs.color.trim().replace(/^#/, "").toLowerCase() }),
      ...(f.attrs.grdOfsY && { groundOffsetY: int(f.attrs.grdOfsY) }),
      ...(f.attrs.dir && { dir: f.attrs.dir }),
    })),
    anims: childrenNamed(s, "anim").map((a) => ({
      frames: ints(a.attrs.range!),
      rhythm: a.attrs.rhythm ? ints(a.attrs.rhythm) : [],
      auto: a.attrs.auto === "true",
    })),
    ...(s.attrs.engine && { engine: s.attrs.engine }),
    ...(s.attrs.dir && { dir: s.attrs.dir }),
    ...(pad && { modulePad: pair(pad.text) }),
    ...(s.attrs.prioOfs && { prioOffset: int(s.attrs.prioOfs) }),
    ...(states.length > 0 && { states: Object.fromEntries(states.map((st) => [st.attrs.id!, st.text])) }),
  };
}

const hex = (...bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
const argbToRgba = (argb: number) => hex((argb >>> 16) & 0xff, (argb >>> 8) & 0xff, argb & 0xff, argb >>> 24);
const ints = (s: string) => s.split(",").map((v) => int(v));
const pair = (s: string): [number, number] => {
  const [a, b] = ints(s);
  return [a!, b!];
};

function int(s: string | undefined): number {
  const n = Number.parseInt((s ?? "").trim(), 10);
  if (Number.isNaN(n)) fail(`expected an integer, got ${JSON.stringify(s)}`);
  return n;
}

function fail(message: string): never {
  throw new Error(`ship-layout: ${message}`);
}

/** The room graph for the rules: rooms that have at least one door, with their targets. */
export function roomGraph(map: ShipMap): ShipRoom[] {
  return map.rooms.flatMap((r) => {
    const doors = [...new Set(r.tiles.flatMap((t) => (t.door ? [t.door.target] : [])))].sort();
    // Built-only equipment (the turret room's sofa) is drawn by the map but isn't there until someone builds it.
    const equipment = placedEquipment(r).filter(({ type }) => !EQUIPMENT_TYPES[type]?.builtOnly).map(({ id, type, chairs }) => ({ id, type, ...(chairs && { chairs }) }));
    return doors.length > 0 ? [{ id: r.id, label: r.label, doors, equipment }] : [];
  });
}

export const formatRooms = (rooms: ShipRoom[]) =>
  `[\n${rooms.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`;

/** JSON with one frame or animation per line: diffable without being enormous. */
export function formatArt(art: ShipArt): string {
  const inline = new Map<string, string>();
  const json = JSON.stringify(
    art,
    (key, value: unknown) => {
      // Keep small leaf structures on one line.
      const compact =
        (key === "frames" || key === "anims") && Array.isArray(value)
          ? value.map((v) => JSON.stringify(v))
          : key === "offset" || key === "footprint" || key === "modulePad" || key === "flags"
            ? [JSON.stringify(value)]
            : null;
      if (!compact) return value;
      const token = `@@${inline.size}@@`;
      inline.set(token, key === "frames" || key === "anims" ? `[\n${compact.map((c) => `        ${c}`).join(",\n")}\n      ]` : compact[0]!);
      return token;
    },
    2,
  );
  return json.replace(/"(@@\d+@@)"/g, (_, token: string) => inline.get(token)!) + "\n";
}

if (import.meta.main) {
  const xml = readFileSync(resolve(MUSH, ISO, "xml/tiles.xml"), "utf8");
  const { art, pages } = pageSheets(convert(xml, (image) => pngSize(readFileSync(resolve(MUSH, image)))));
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, formatArt(art));
  for (const source of new Set(pages.map((p) => p.source))) {
    const img = decodePng(readFileSync(resolve(MUSH, source)));
    for (const page of pages.filter((p) => p.source === source)) {
      mkdirSync(dirname(resolve(MUSH, page.image)), { recursive: true });
      writeFileSync(resolve(MUSH, page.image), encodePng(buildPage(img, page)));
    }
  }
  if (pages.length) console.log(`Wrote ${pages.length} sheet pages: ${pages.map((p) => `${p.image} (${p.width}x${p.height})`).join(", ")}.`);
  const map = JSON.parse(readFileSync(MAP, "utf8")) as ShipMap;
  writeFileSync(ROOMS_OUTPUT, formatRooms(roomGraph(map)));
  const plan = convertShipPlan(cachedPlan(readFileSync(resolve(MUSH, "src/common/data/Map.hx"), "utf8")), ROOM_IDS);
  writeFileSync(PLAN_OUTPUT, formatShipPlan(plan));
  console.log(`Wrote ${OUTPUT}: ${Object.keys(art.slices).length} slices; ${ROOMS_OUTPUT}: ${map.rooms.length} rooms from ship-map.json.`);
}
