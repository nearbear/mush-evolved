import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ShipPlan, ShipRoom } from "@mush2/shared";
import { convert, formatLayout, formatRooms, ROOM_IDS, roomGraph } from "../../src/shipLayout/convert.ts";
import { unserialize } from "../../src/shipLayout/haxe.ts";
import { decodePng, encodePng as writePng, pngSize, type Image } from "../../src/shipLayout/png.ts";
import { buildPage, pageSheets } from "../../src/shipLayout/pages.ts";
import { cachedPlan, convertShipPlan, formatShipPlan, runs } from "../../src/shipLayout/shipPlan.ts";
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
  // 2x2 rooms. Only the first room (COMMAND_CENTER) has content; the image is
  // tall enough for every room row. Columns: base layer, props layer, two empty layers.
  const W = 0xffffff;
  const map = (cells: number[][]): Image => {
    const width = 8;
    const height = 2 * 30;
    const rgba = new Uint8Array(width * height * 4).fill(255);
    cells.forEach((row, y) =>
      row.forEach((c, x) => rgba.set([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255], (y * width + x) * 4)),
    );
    return { width, height, rgba };
  };
  const xml = (doors: string) => `<data>
    <bitmap startX="0" maxRoomWidth="2" maxRoomHeight="2"/>
    <tiles><sheet src="BmpGfx2">
      <slice id="GROUND" params="0,0,32,20,2" data="_pathable"><frame color="ffa301"/><frame color="#ffa3ff "/></slice>
      <slice id="DOOR_L" params="0,40,40,70,1" data="_door"><dep>1,2</dep><frame color="c0c0c0"/></slice>
      <slice id="lamp" params="0,200,10,10"><frame color="123456"/></slice>
    </sheet></tiles>
    <extras><room rid="COMMAND_CENTER">${doors}</room><autoBind/></extras>
  </data>`;
  const size = () => ({ width: 2000, height: 2000 });
  const img = map([
    [0xffa301, 0xc0c0c0, 0x123456, W, W, W, W, W],
    [0xffa3ff, W, W, W, W, W, W, W],
  ]);

  it("turns pixels into typed placements and assigns door targets", () => {
    const layout = convert(img, xml('<makeDoor tgt="CORRIDOR_A"/>'), size);
    const room = layout.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    expect(room.tiles).toEqual([
      { x: 0, y: 0, kind: "ground", layer: 0, slice: "GROUND", frame: 0 },
      { x: 1, y: 0, kind: "door", layer: 0, slice: "DOOR_L", frame: 0, door: { target: "CORRIDOR_A" } },
      { x: 0, y: 1, kind: "ground", layer: 0, slice: "GROUND", frame: 1 },
      { x: 0, y: 0, kind: "prop", layer: 1, slice: "lamp", frame: 0 },
    ]);
    expect(layout.slices.DOOR_L!.footprint).toEqual([1, 2]);
  });

  it("fails when doors and <makeDoor> entries disagree", () => {
    expect(() => convert(img, xml(""), size)).toThrow(/1 doors in the map but 0/);
  });

  it("fails on colors tiles.xml does not define", () => {
    const bad = map([[0xabcdef, W, W, W, W, W, W, W], [W, W, W, W, W, W, W, W]]);
    expect(() => convert(bad, xml(""), size)).toThrow(/unknown map color abcdef/);
  });

  it("fails when a slice extends past its sheet image", () => {
    expect(() => convert(img, xml(""), () => ({ width: 10, height: 10 }))).toThrow(/extends past/);
  });
});

describe("generated ship-layout.json", () => {
  const { layout, pages } = pageSheets(
    convert(
      decodePng(readFileSync(resolve(MUSH, "clients/iso/gfx/ShipMap.png"))),
      readFileSync(resolve(MUSH, "clients/iso/xml/tiles.xml"), "utf8"),
      (image) => pngSize(readFileSync(resolve(MUSH, image))),
    ),
  );

  it("is up to date with ShipMap.png and tiles.xml (run `npm run ship-layout`)", () => {
    expect(formatLayout(layout)).toBe(readFileSync(resolve(MUSH, "derived/ship-layout.json"), "utf8"));
    expect(formatRooms(roomGraph(layout))).toBe(readFileSync(resolve(MUSH, "derived/ship-rooms.json"), "utf8"));
  });

  it("has every sheet within a phone GPU's texture limit, and its pages up to date", () => {
    for (const sheet of Object.values(layout.sheets)) expect(Math.max(sheet.width, sheet.height)).toBeLessThanOrEqual(4096);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = decodePng(readFileSync(resolve(MUSH, page.source)));
      const written = decodePng(readFileSync(resolve(MUSH, page.image)));
      expect(Buffer.from(written.rgba).equals(Buffer.from(buildPage(source, page).rgba)), page.image).toBe(true);
    }
  });

  it("has two-way doors only", () => {
    const layout = JSON.parse(readFileSync(resolve(MUSH, "derived/ship-layout.json"), "utf8")) as ReturnType<
      typeof convert
    >;
    const edges = new Set(
      layout.rooms.flatMap((r) => r.tiles.flatMap((t) => (t.door ? [`${r.id}>${t.door.target}`] : []))),
    );
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
