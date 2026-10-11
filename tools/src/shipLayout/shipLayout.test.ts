import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { convert, formatLayout, formatRooms, roomGraph } from "./convert.ts";
import { decodePng, pngSize, type Image } from "./png.ts";
import { parseXml } from "./xml.ts";

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
  it("is up to date with ShipMap.png and tiles.xml (run `npm run ship-layout`)", () => {
    const layout = convert(
      decodePng(readFileSync(resolve(MUSH, "clients/iso/gfx/ShipMap.png"))),
      readFileSync(resolve(MUSH, "clients/iso/xml/tiles.xml"), "utf8"),
      (image) => pngSize(readFileSync(resolve(MUSH, image))),
    );
    expect(formatLayout(layout)).toBe(readFileSync(resolve(MUSH, "derived/ship-layout.json"), "utf8"));
    expect(formatRooms(roomGraph(layout))).toBe(readFileSync(resolve(MUSH, "derived/ship-rooms.json"), "utf8"));
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
