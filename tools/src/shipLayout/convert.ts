// Build-time converter: Motion Twin's ShipMap.png + tiles.xml -> ship-layout.json
// (everything the renderer needs) and ship-rooms.json (just the room graph, for the rules).
// Also writes ship-plan.json, the minimap's deck plan (see shipPlan.ts), and cuts sheets too big
// for a GPU texture into pages under derived/pages/ (see pages.ts).
//
// Run with `npm run ship-layout`. Reproduces how the original Flash client
// read these files (clients/iso/src/Data.hx `makeMap`/`addToStore`, Ship.hx
// `buildRoomBmp`/`decorateDeps`), so comments cite those functions. Then it
// applies our own changes to the room shapes (stretch.ts) and what's in them (moves.ts).
//
// The output is derived from CC BY-NC-SA material, so it is written into the
// Mush/ tree, not into our code.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  EquipmentBinding,
  RoomLayout,
  SheetInfo,
  ShipLayout,
  ShipRoom,
  SliceInfo,
  TileKind,
  TilePlacement,
} from "@mush2/shared";
// The leaf module, not the package index: the index loads config.ts, which reads the file this tool writes.
import { placedEquipment } from "../../../shared/src/shipLayout.ts";
import { EQUIPMENT_TYPES } from "../../../shared/src/equipment.ts";
import { decodePng, encodePng, pngSize, type Image } from "./png.ts";
import { buildPage, pageSheets } from "./pages.ts";
import { cachedPlan, convertShipPlan, formatShipPlan } from "./shipPlan.ts";
import { placeRooms, ROOM_POSITIONS, type Positions } from "./roomPositions.ts";
import { MOVES, moveTiles, type TileMove } from "./moves.ts";
import { stretchRooms } from "./stretch.ts";
import { DECK_ROOMS, deckFloors, paintWalkways, WALKWAYS, type Walkway } from "./walkways.ts";
import { child, childrenNamed, parseXml, type XmlElement } from "./xml.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
const ISO = "clients/iso";
const OUTPUT = resolve(MUSH, "derived/ship-layout.json");
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
 * Rows of ShipMap.png follow the RoomId enum, which is the `rooms` sheet of
 * data/Data.ods. Labels are the English text drawn beside each row (patrol
 * ships use their names from Data.ods). Stops at OUTER_SPACE: later rows are
 * empty and their labels don't match this snapshot of Data.ods.
 */
const ROOMS: [id: string, label: string][] = [
  ["COMMAND_CENTER", "Command center"],
  ["SPACESHIP_BAY_A", "Bay Alpha"],
  ["SPACESHIP_BAY_B", "Bay Beta"],
  ["SPACESHIP_BAY_AA", "Bay Alpha 2"],
  ["NEXUS_ROOM", "Nexus"],
  ["SICK_BAY", "Sick bay"],
  ["LABORATORY", "Laboratory"],
  ["REFECTORY", "Refectory"],
  ["HYDROPONIC_CENTER", "Hydroponic center"],
  ["MOTOR_ROOM", "Motor room"],
  ["LASER_TURRET_A_0", "Laser turret Alpha front"],
  ["LASER_TURRET_A_1", "Laser turret Alpha centre"],
  ["LASER_TURRET_A_2", "Laser turret Alpha back"],
  ["LASER_TURRET_B_0", "Laser turret Beta front"],
  ["LASER_TURRET_B_1", "Laser turret Beta centre"],
  ["LASER_TURRET_B_2", "Laser turret Beta back"],
  ["PATROL_SHIP_A_0", "Patrol ship Longane"],
  ["PATROL_SHIP_A_1", "Patrol ship Jujube"],
  ["PATROL_SHIP_A_2", "Patrol ship Tamarin"],
  ["PATROL_SHIP_B_0", "Patrol ship Socrate"],
  ["PATROL_SHIP_B_1", "Patrol ship Epicure"],
  ["PATROL_SHIP_B_2", "Patrol ship Platon"],
  ["PATROL_SHIP_AA_0", "Patrol ship Wallis"],
  ["PATROL_SHIP_AA_1", "Pasiphae"],
  ["CORRIDOR_A", "Corridor front"],
  ["CORRIDOR_B", "Corridor centre"],
  ["CORRIDOR_C", "Corridor back"],
  ["PLANET", "Planet"],
  ["ICARUS", "Icarus bay"],
  ["BEDROOM_A", "Bedroom Alpha"],
  ["BEDROOM_B", "Bedroom Beta"],
  ["STORAGE_FRONT", "Storage front"],
  ["STORAGE_A_0", "Storage Alpha centre"],
  ["STORAGE_A_1", "Workshop"],
  ["STORAGE_B_0", "Storage Beta centre"],
  ["STORAGE_B_1", "Storage back"],
  ["OUTER_SPACE", "Outer space"],
];

/** RoomId enum order, which Map.hx's serialized plan indexes rooms by. */
export const ROOM_IDS = ROOMS.map(([id]) => id);

/** Data.makeClones: every patrol ship except PATROL_SHIP_AA_1 reuses the next room's row. */
const isClone = (id: string) => id.startsWith("PATROL_SHIP_") && id !== "PATROL_SHIP_AA_1";

const LAYERS = 4;

/**
 * Colors in ShipMap.png that tiles.xml never defines. The original client
 * skipped unknown colors silently; we skip only these, so new ones fail loudly.
 * 31e536 is probably a typo for 31e537 (the coffee machine).
 */
const UNDEFINED_MAP_COLORS = new Set(["31e536", "7d2c2c", "cc95de"]);

export function convert(
  mapImage: Image,
  tilesXml: string,
  sheetSize: (file: string) => { width: number; height: number },
  {
    positions = ROOM_POSITIONS,
    walkways = WALKWAYS,
    deck = DECK_ROOMS,
    moves = MOVES,
  }: { positions?: Positions; walkways?: readonly Walkway[]; deck?: readonly string[]; moves?: readonly TileMove[] } = {},
): ShipLayout {
  const xml = parseXml(tilesXml);
  const data = child(xml, "data") ?? fail("tiles.xml: missing <data>");
  const bitmap = child(data, "bitmap") ?? fail("tiles.xml: missing <bitmap>");
  const startX = int(bitmap.attrs.startX);
  const size = int(bitmap.attrs.maxRoomWidth);
  if (int(bitmap.attrs.maxRoomHeight) !== size) fail("non-square rooms are not supported");

  const sheets: Record<string, SheetInfo> = {};
  const slices: Record<string, SliceInfo> = {};
  const byColor = new Map<string, { slice: string; frame: number }>();

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
      // Data.addToStore: a color may only be defined once across all sheets.
      slice.frames.forEach((f, frame) => {
        if (!f.color) return;
        if (byColor.has(f.color)) fail(`color ${f.color} defined twice`);
        byColor.set(f.color, { slice: s.attrs.id!, frame });
      });
    }
  }

  const extrasEl = child(data, "extras") ?? fail("missing <extras>");
  const extras = new Map<string, XmlElement>();
  for (const r of childrenNamed(extrasEl, "room")) extras.set(r.attrs.rid!, r);
  for (const rid of extras.keys()) {
    if (!ROOMS.some(([id]) => id === rid)) fail(`<extras> names unknown room ${rid}`);
  }

  const rowsNeeded = ROOMS.filter(([id]) => !isClone(id)).length;
  if (mapImage.height < rowsNeeded * size || mapImage.width < startX + LAYERS * size) {
    fail(`map image is ${mapImage.width}x${mapImage.height}, too small for ${rowsNeeded} rooms`);
  }

  const rooms: RoomLayout[] = [];
  let row = 0;
  for (const [id, label] of ROOMS) {
    const extra = extras.get(id);
    const tiles = readRoom(mapImage, startX, row * size, size, slices, byColor);
    assignDoors(id, tiles, extra ? childrenNamed(extra, "makeDoor").map((d) => d.attrs.tgt!) : []);
    rooms.push({ id, label, tiles, equipment: extra ? childrenNamed(extra, "bindEquipment").map(parseBinding) : [] });
    if (!isClone(id)) row++;
  }
  // Nothing may be drawn below the last room we know about.
  for (let y = row * size; y + size <= mapImage.height; y += size) {
    if (readRoom(mapImage, startX, y, size, slices, byColor).length > 0) fail(`unexpected tiles in map row at y=${y}`);
  }

  const autoBind = childrenNamed(child(extrasEl, "autoBind") ?? fail("missing <autoBind>"), "eq").map((e) => ({
    id: e.attrs.id!,
    tile: e.attrs.tile!,
  }));

  for (const ref of [...rooms.flatMap((r) => r.equipment), ...autoBind]) {
    for (const s of [ref.tile, (ref as EquipmentBinding).mask]) {
      if (s && !slices[s]) fail(`equipment ${ref.id} references unknown slice ${s}`);
    }
  }

  // Our changes to the room shapes (stretch.ts), what's in them (moves.ts) and floors (walkways.ts), then
  // where each room sits on the ship (roomPositions.ts); tile indices are kept.
  const edited = paintWalkways(moveTiles(stretchRooms(rooms, slices), moves), walkways);
  return { roomSize: size, sheets, slices, rooms: deckFloors(placeRooms(edited, slices, positions), walkways, deck), autoBind };
}

/** Ship.buildRoomBmp: four side-by-side size x size layers per room row. */
function readRoom(
  img: Image,
  startX: number,
  top: number,
  size: number,
  slices: Record<string, SliceInfo>,
  byColor: Map<string, { slice: string; frame: number }>,
): TilePlacement[] {
  const tiles: TilePlacement[] = [];
  for (let layer = 0; layer < LAYERS; layer++) {
    const left = startX + layer * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = ((top + y) * img.width + left + x) * 4;
        if (img.rgba[i + 3] === 0) continue;
        const color = hex(img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!);
        if (color === "ffffff" || UNDEFINED_MAP_COLORS.has(color)) continue; // white = empty cell
        const hit = byColor.get(color) ?? fail(`unknown map color ${color} at ${left + x},${top + y}`);
        const slice = slices[hit.slice]!;
        tiles.push({ x, y, kind: kindOf(layer, slice), layer: layer as TilePlacement["layer"], slice: hit.slice, frame: hit.frame });
      }
    }
  }
  return tiles;
}

/**
 * Layer 0 is floor if the slice is pathable, otherwise wall (doors are walls
 * with a footprint). Layer 1 is a prop unless the slice has a footprint, in
 * which case the original made it an entity. Layers 2 and 3 are always entities.
 */
function kindOf(layer: number, slice: SliceInfo): TileKind {
  if (layer === 0) {
    if (slice.flags.includes("pathable")) return "ground";
    return slice.flags.includes("door") ? "door" : "wall";
  }
  if (layer === 1) return slice.footprint ? "entity" : "prop";
  if (!slice.footprint) fail(`slice on layer ${layer} has no footprint`);
  return "entity";
}

/**
 * Ship.decorateDeps hands out `<makeDoor tgt>` entries, in XML order, to door
 * tiles in the order they were created: layer, then row, then column. That is
 * the order readRoom produces, so we can zip them.
 */
function assignDoors(roomId: string, tiles: TilePlacement[], targets: string[]): void {
  const doors = tiles.filter((t) => t.kind === "door");
  if (doors.length !== targets.length) {
    fail(`${roomId}: ${doors.length} doors in the map but ${targets.length} <makeDoor> entries`);
  }
  doors.forEach((d, i) => {
    d.door = { target: targets[i]! };
  });
}

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
    offset: [ofs[0] || 0, ofs[1] || 0],
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

function parseBinding(b: XmlElement): EquipmentBinding {
  const { id, tile, mask, dir, module, key, data } = b.attrs;
  return {
    id: id!,
    tile: tile!,
    ...(mask && { mask }),
    ...(dir && { dir }),
    ...(module && { module: module === "true" }),
    ...(key && { key }),
    ...(data && { data }),
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
export function roomGraph(layout: ShipLayout): ShipRoom[] {
  return layout.rooms.flatMap((r) => {
    const doors = [...new Set(r.tiles.flatMap((t) => (t.door ? [t.door.target] : [])))].sort();
    // Built-only equipment (the turret room's sofa) is drawn by the map but isn't there until someone builds it.
    const equipment = placedEquipment(r).filter(({ type }) => !EQUIPMENT_TYPES[type]?.builtOnly).map(({ id, type }) => ({ id, type }));
    return doors.length > 0 ? [{ id: r.id, label: r.label, doors, equipment }] : [];
  });
}

export const formatRooms = (rooms: ShipRoom[]) =>
  `[\n${rooms.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`;

/** JSON with one tile per line: diffable without being enormous. */
export function formatLayout(layout: ShipLayout): string {
  const inline = new Map<string, string>();
  const json = JSON.stringify(
    layout,
    (key, value: unknown) => {
      // Keep small leaf structures on one line.
      const compact =
        (key === "tiles" || key === "frames" || key === "anims") && Array.isArray(value)
          ? value.map((v) => JSON.stringify(v))
          : key === "offset" || key === "footprint" || key === "modulePad" || key === "flags" || key === "at"
            ? [JSON.stringify(value)]
            : null;
      if (!compact) return value;
      const token = `@@${inline.size}@@`;
      inline.set(token, key === "tiles" || key === "frames" || key === "anims" ? `[\n${compact.map((c) => `        ${c}`).join(",\n")}\n      ]` : compact[0]!);
      return token;
    },
    2,
  );
  return json.replace(/"(@@\d+@@)"/g, (_, token: string) => inline.get(token)!) + "\n";
}

if (import.meta.main) {
  const map = decodePng(readFileSync(resolve(MUSH, ISO, "gfx/ShipMap.png")));
  const xml = readFileSync(resolve(MUSH, ISO, "xml/tiles.xml"), "utf8");
  const { layout, pages } = pageSheets(convert(map, xml, (image) => pngSize(readFileSync(resolve(MUSH, image)))));
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, formatLayout(layout));
  for (const source of new Set(pages.map((p) => p.source))) {
    const img = decodePng(readFileSync(resolve(MUSH, source)));
    for (const page of pages.filter((p) => p.source === source)) {
      mkdirSync(dirname(resolve(MUSH, page.image)), { recursive: true });
      writeFileSync(resolve(MUSH, page.image), encodePng(buildPage(img, page)));
    }
  }
  if (pages.length) console.log(`Wrote ${pages.length} sheet pages: ${pages.map((p) => `${p.image} (${p.width}x${p.height})`).join(", ")}.`);
  writeFileSync(ROOMS_OUTPUT, formatRooms(roomGraph(layout)));
  const plan = convertShipPlan(cachedPlan(readFileSync(resolve(MUSH, "src/common/data/Map.hx"), "utf8")), ROOM_IDS);
  writeFileSync(PLAN_OUTPUT, formatShipPlan(plan));
  const tiles = layout.rooms.reduce((n, r) => n + r.tiles.length, 0);
  console.log(`Wrote ${OUTPUT}: ${layout.rooms.length} rooms, ${tiles} tiles, ${Object.keys(layout.slices).length} slices.`);
}
