import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ShipArt, ShipMap, ShipPlan, ShipRoom } from "@mush2/shared";
import { formatShipMap, readArt } from "../../src/shipLayout/shipMap.ts";
import { convert, formatArt, formatRooms, ROOM_IDS, roomGraph } from "../../src/shipLayout/convert.ts";
import { unserialize } from "../../src/shipLayout/haxe.ts";
import { decodePng, encodePng as writePng, pngSize } from "../../src/shipLayout/png.ts";
import { buildPage, pageSheets } from "../../src/shipLayout/pages.ts";
import { cachedPlan, convertShipPlan, formatShipPlan, runs } from "../../src/shipLayout/shipPlan.ts";
import { validateMap } from "../../src/shipLayout/validate.ts";
import { parseXml } from "../../src/shipLayout/xml.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");

/** Encodes RGBA rows as a PNG, using the given filter type on every row. */
function encodePng(width: number, height: number, rgba: number[], filter = 0): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(filter);
    const row = rgba.slice(y * width * 4, (y + 1) * width * 4);
    const prev = y > 0 ? rgba.slice((y - 1) * width * 4, y * width * 4) : row.map(() => 0);
    // Only None (0) and Up (2) are needed to exercise the unfilter path.
    raw.push(...row.map((v, i) => (filter === 2 ? (v - prev[i]! + 256) & 0xff : v)));
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out; // CRC left as zero: the decoder doesn't check it.
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", new Uint8Array()),
  ]);
}

describe("decodePng", () => {
  const pixels = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40];

  it("decodes unfiltered RGBA", () => {
    const img = decodePng(encodePng(2, 2, pixels));
    expect([img.width, img.height]).toEqual([2, 2]);
    expect([...img.rgba]).toEqual(pixels);
  });

  it("reverses the Up filter", () => {
    expect([...decodePng(encodePng(2, 2, pixels, 2)).rgba]).toEqual(pixels);
  });

  it("reads the size from the header", () => {
    expect(pngSize(encodePng(2, 2, pixels))).toEqual({ width: 2, height: 2 });
  });

  it("reads back what encodePng writes", () => {
    const img = { width: 3, height: 2, rgba: new Uint8Array([...pixels, 1, 2, 3, 4, 200, 100, 50, 25]) };
    const back = decodePng(writePng(img));
    expect([back.width, back.height, ...back.rgba]).toEqual([3, 2, ...img.rgba]);
  });

  it("decodes the real ship map (RGBA, all filter types)", () => {
    const img = decodePng(readFileSync(resolve(MUSH, "clients/iso/gfx/ShipMap.png")));
    expect([img.width, img.height]).toEqual([256, 1218]);
  });
});

describe("parseXml", () => {
  it("reads nested elements, attributes, and text, skipping comments", () => {
    const root = parseXml('<?xml version="1.0"?><a x = "1"><!-- c -></!--><b y="2"/><dep>1,1</dep></a>');
    const a = root.children[0]!;
    expect(a.attrs).toEqual({ x: "1" });
    expect(a.children.map((c) => c.name)).toEqual(["b", "dep"]);
    expect(a.children[1]!.text).toBe("1,1");
  });

  it("rejects input it cannot parse instead of skipping it", () => {
    expect(() => parseXml("<a><b x=1/></a>")).toThrow(/Unparsed/);
    expect(() => parseXml("<a><b></a>")).toThrow(/Mismatched/);
  });
});

describe("convert", () => {
  const xml = (bind: string) => `<data>
    <tiles><sheet src="BmpGfx2">
      <slice id="GROUND" params="0,0,32,20,2" data="_pathable"><frame color="ffa301"/><frame color="#ffa3ff "/></slice>
      <slice id="DOOR_L" params="0,40,40,70,1" data="_door"><dep>1,2</dep><frame color="c0c0c0"/></slice>
    </sheet></tiles>
    <extras><autoBind>${bind}</autoBind></extras>
  </data>`;
  const size = () => ({ width: 2000, height: 2000 });

  it("reads each slice's sheet rectangle, frames, flags and footprint", () => {
    const art = convert(xml('<eq id="DOOR" tile="DOOR_L"/>'), size);
    expect(art.slices.GROUND).toMatchObject({ sheet: "BmpGfx2", x: 0, y: 0, width: 32, height: 20, framesX: 2, flags: ["pathable"] });
    expect(art.slices.GROUND!.frames).toEqual([{ color: "ffa301" }, { color: "ffa3ff" }]);
    expect(art.slices.DOOR_L!.footprint).toEqual([1, 2]);
    expect(art.autoBind).toEqual([{ id: "DOOR", tile: "DOOR_L" }]);
  });

  it("fails on equipment bound to a slice that doesn't exist", () => {
    expect(() => convert(xml('<eq id="DOOR" tile="nope"/>'), size)).toThrow(/unknown slice nope/);
  });

  it("fails when a slice extends past its sheet image", () => {
    expect(() => convert(xml(""), () => ({ width: 10, height: 10 }))).toThrow(/extends past/);
  });
});

describe("generated ship-art.json", () => {
  const { art, pages } = pageSheets(
    convert(readFileSync(resolve(MUSH, "clients/iso/xml/tiles.xml"), "utf8"), (image) => pngSize(readFileSync(resolve(MUSH, image)))),
  );

  it("is up to date with tiles.xml (run `npm run ship-layout`)", () => {
    expect(formatArt(art)).toBe(readFileSync(resolve(MUSH, "derived/ship-art.json"), "utf8"));
  });

  it("has every sheet within a phone GPU's texture limit, and its pages up to date", () => {
    for (const sheet of Object.values(art.sheets)) expect(Math.max(sheet.width, sheet.height)).toBeLessThanOrEqual(4096);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = decodePng(readFileSync(resolve(MUSH, page.source)));
      const written = decodePng(readFileSync(resolve(MUSH, page.image)));
      expect(Buffer.from(written.rgba).equals(Buffer.from(buildPage(source, page).rgba)), page.image).toBe(true);
    }
  });
});

describe("ship-map.json", () => {
  const map = JSON.parse(readFileSync(resolve(MUSH, "derived/ship-map.json"), "utf8")) as ShipMap;
  const art = readArt();

  it("is written in its one-tile-per-line format", () => {
    expect(formatShipMap(map)).toBe(readFileSync(resolve(MUSH, "derived/ship-map.json"), "utf8"));
  });

  it("gives the rules an up-to-date ship-rooms.json (run `npm run ship-layout`)", () => {
    expect(formatRooms(roomGraph(map))).toBe(readFileSync(resolve(MUSH, "derived/ship-rooms.json"), "utf8"));
  });

  it("draws only slices and frames that exist, and binds equipment only to slices that exist", () => {
    for (const room of map.rooms) {
      for (const t of room.tiles) {
        const slice = art.slices[t.slice];
        expect(slice, `${room.id}: unknown slice ${t.slice}`).toBeDefined();
        expect(t.frame < slice!.framesX * slice!.framesY, `${room.id}: ${t.slice} has no frame ${t.frame}`).toBe(true);
      }
      for (const b of room.equipment) for (const s of [b.tile, b.mask]) if (s) expect(art.slices[s], `${room.id}: ${b.id} binds unknown ${s}`).toBeDefined();
    }
  });

  it("passes the editor's check before saving", () => {
    expect(validateMap(map, art)).toEqual([]);
  });

  it("has two-way doors only, each with a target", () => {
    for (const room of map.rooms) for (const t of room.tiles) if (t.kind === "door") expect(t.door?.target, `${room.id}: door at ${t.x},${t.y}`).toBeDefined();
    const edges = new Set(map.rooms.flatMap((r) => r.tiles.flatMap((t) => (t.door ? [`${r.id}>${t.door.target}`] : []))));
    for (const e of edges) {
      const [from, to] = e.split(">");
      expect(edges.has(`${to}>${from}`), `door ${from} -> ${to} has no way back`).toBe(true);
    }
  });
});

describe("unserialize (Haxe)", () => {
  it("reads objects, class instances, arrays, int maps, enums, and references", () => {
    expect(unserialize("oy1:ai-3y1:bai1zu2nhg")).toEqual({ a: -3, b: [1, 0, null, null, null] });
    expect(unserialize("cy3:V2Iy1:xi1y1:yi2g")).toEqual({ __class: "V2I", x: 1, y: 2 });
    expect(unserialize("q:5t:7fh")).toEqual({ 5: true, 7: false });
    expect(unserialize("jy4:Dirs:2:0")).toEqual({ __enum: "Dirs", index: 2, args: [] });
    // R0 repeats the first string; r1 repeats the second object (the inner array).
    expect(unserialize("ay2:hiaai1hhr1R0h")).toEqual(["hi", [[1]], [[1]], "hi"]);
    expect(unserialize("Cy4:Hashy1:kg")).toEqual({ __custom: "Hash", parts: ["k"] });
  });

  it("decodes URL-encoded strings", () => {
    expect(unserialize("y5:a%20b")).toBe("a b");
  });

  it("fails on unsupported tags and trailing data", () => {
    expect(() => unserialize("x")).toThrow(/unsupported tag/);
    expect(() => unserialize("i1i2")).toThrow(/trailing data/);
  });
});

describe("generated ship-plan.json", () => {
  const plan = JSON.parse(readFileSync(resolve(MUSH, "derived/ship-plan.json"), "utf8")) as ShipPlan;
  const rules = JSON.parse(readFileSync(resolve(MUSH, "derived/ship-rooms.json"), "utf8")) as ShipRoom[];

  it("is up to date with Map.hx (run `npm run ship-layout`)", () => {
    const fresh = convertShipPlan(cachedPlan(readFileSync(resolve(MUSH, "src/common/data/Map.hx"), "utf8")), ROOM_IDS);
    expect(formatShipPlan(fresh)).toBe(readFileSync(resolve(MUSH, "derived/ship-plan.json"), "utf8"));
  });

  it("has exactly the rooms the rules use", () => {
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(rules.map((r) => r.id).sort());
  });

  // Catches a wrong enum order: rooms would land on the wrong shapes.
  it("has the same doors as the rules' room graph", () => {
    const planEdges = new Set(plan.doors.flatMap(({ rooms: [a, b] }) => [`${a}>${b}`, `${b}>${a}`]));
    const ruleEdges = new Set(rules.flatMap((r) => r.doors.map((to) => `${r.id}>${to}`)));
    expect([...planEdges].sort()).toEqual([...ruleEdges].sort());
  });

  it("keeps rooms, doors, and walls on separate cells inside the plan", () => {
    const seen = new Set<string>();
    const cells = [
      ...plan.rooms.flatMap((r) => r.runs),
      ...plan.walls,
      ...plan.doors.flatMap((d) => d.cells.map(([x, y]) => [x, y, 1] as const)),
    ].flatMap(([x, y, n]) => Array.from({ length: n }, (_, i) => [x + i, y] as const));
    for (const [x, y] of cells) {
      expect(seen.has(`${x},${y}`), `cell ${x},${y} used twice`).toBe(false);
      seen.add(`${x},${y}`);
      expect(x >= 0 && x < plan.width && y >= 0 && y < plan.height).toBe(true);
    }
  });
});

describe("runs", () => {
  it("packs cells into horizontal runs and drops duplicates", () => {
    const cells = [[2, 0], [0, 0], [1, 0], [1, 0], [3, 1], [5, 1]].map(([x, y]) => ({ x: x!, y: y! }));
    expect(runs(cells)).toEqual([[0, 0, 3], [3, 1, 1], [5, 1, 1]]);
  });
});

describe("validateMap", () => {
  const art = { slices: { GROUND: { framesX: 2, framesY: 1 } } } as unknown as ShipArt;
  const ok = (over: object = {}) => ({ x: 0, y: 0, kind: "ground", layer: 0, slice: "GROUND", frame: 0, ...over });
  const check = (tiles: object[], extra: object[] = []) =>
    validateMap({ rooms: [{ id: "A", label: "A", equipment: [], tiles }, ...extra] } as unknown as ShipMap, art);

  it("accepts a sound map", () => {
    expect(check([ok(), ok({ kind: "door", door: { target: "B" } })], [{ id: "B", label: "B", equipment: [], tiles: [] }])).toEqual([]);
  });

  it("names each problem: unknown slices and frames, bad cells, kinds and layers, doors going nowhere", () => {
    const problems = check([
      ok({ slice: "nope" }),
      ok({ frame: 2 }),
      ok({ x: 0.5 }),
      ok({ kind: "furniture" }),
      ok({ layer: 7 }),
      ok({ kind: "door" }),
      ok({ kind: "door", door: { target: "Z" } }),
      ok({ door: { target: "A" } }),
    ]);
    expect(problems).toEqual([
      "A #0: unknown slice nope",
      "A #1: GROUND has no frame 2",
      "A #2: its cell isn't two whole numbers",
      "A #3: unknown kind furniture",
      "A #4: layer must be 0 to 3",
      "A #5: a door with no room to go to",
      "A #7: a door target on a ground",
      "A #6: a door to Z, which isn't a room",
    ]);
  });

  it("refuses something that isn't a map", () => {
    expect(validateMap({} as ShipMap, art)).toEqual(["the map has no rooms list"]);
  });
});

