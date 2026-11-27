import { Container, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { emitterBudget, emitterCount, fireWeights, NEIGHBOR_EMITTERS, PartPool, RoomFire } from "../../src/iso/pixi/fire.ts";

// Dummy textures for frames 0..5.
const dummyTextures = Array.from({ length: 6 }, () => new Texture());

/** A w x h floor, its cells' centres 16 px apart in the scene (enough for the fire, which only reads them). */
const floor = (w: number, h: number) => Array.from({ length: w * h }, (_, i) => ({ cell: { x: i % w, y: Math.floor(i / w) }, x: (i % w) * 16, y: Math.floor(i / w) * 16 }));

/** Every particle alive across the room's layers. */
const alive = (fire: RoomFire, cells: ReturnType<typeof floor>) =>
  cells.reduce((n, c) => n + (fire.layerFor(c.cell)?.children.filter((s) => s.visible).length ?? 0), 0);

describe("emitterCount", () => {
  it("is the original's: all cells up to 8, then ~20%, at most 30", () => {
    expect(emitterCount(0)).toBe(0);
    expect(emitterCount(5)).toBe(5);
    expect(emitterCount(20)).toBe(8);
    expect(emitterCount(100)).toBe(20);
    expect(emitterCount(200)).toBe(30);
  });
});

describe("emitterBudget", () => {
  it("burns this room at the original's rate, and neighbours too while they fit", () => {
    expect(NEIGHBOR_EMITTERS).toBe(30);
    expect(emitterBudget([{ own: true, cells: 200 }, { own: false, cells: 100 }])).toEqual([30, 20]);
  });

  it("shares the neighbours' budget by floor size once they don't fit, never touching this room's", () => {
    const rates = emitterBudget([{ own: true, cells: 100 }, { own: false, cells: 200 }, { own: false, cells: 200 }, { own: false, cells: 100 }]);
    expect(rates[0]).toBe(20);
    expect(rates.slice(1).reduce((a, b) => a + b, 0)).toBeCloseTo(NEIGHBOR_EMITTERS);
    expect(rates[1]).toBeCloseTo(rates[3]! * 1.5);
  });
});

describe("fireWeights", () => {
  const cells = floor(12, 12).map((c) => c.cell);

  it("is the same for the same seed, and between 0 and 1", () => {
    const w = fireWeights(cells, 7);
    expect(fireWeights(cells, 7)).toEqual(w);
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("burns in patches: some cells calm, some burning", () => {
    for (const seed of [1, 2, 3]) {
      const w = fireWeights(cells, seed);
      expect(w.some((v) => v === 0)).toBe(true);
      expect(w.some((v) => v > 0.3)).toBe(true);
    }
  });

  it("varies smoothly from cell to cell", () => {
    const w = fireWeights(cells, 11);
    const at = (x: number, y: number) => w[y * 12 + x]!;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 11; x++) expect(Math.abs(at(x, y) - at(x + 1, y))).toBeLessThan(0.6);
  });

  it("burns every cell alike when the noise leaves nothing burning", () => {
    expect(fireWeights([{ x: 0, y: 0 }], 0).length).toBe(1);
    expect(fireWeights([], 0)).toEqual([]);
  });
});

describe("Part", () => {
  it("starts yellow and visible, and ages through orange and red to smoke", () => {
    const pool = new PartPool(new Container());
    const part = pool.obtain({ x: 4, y: 2 }, dummyTextures);
    expect(part.temperature).toBe("yellow");
    expect(part.sprite.visible).toBe(true);
    expect(part.sprite.texture).toBe(dummyTextures[0]);

    part.tempChange = true;
    part.speedZ = 2.0;
    part.startLife = 1.0;
    part.life = 1.0;
    part.update(0.15, dummyTextures);
    expect(part.temperature).toBe("orange");

    part.tempChange = true;
    part.life = 0.6;
    part.update(0.01, dummyTextures);
    expect(part.temperature).toBe("red");

    part.tempChange = true;
    part.life = 0.45;
    const speedBefore = part.speedZ;
    part.update(0.01, dummyTextures);
    expect(part.temperature).toBe("smoke");
    expect(part.speedZ).toBe(speedBefore * 2);
    expect(part.tempChange).toBe(false);
  });

  it("rises from where it started in its cell", () => {
    const pool = new PartPool(new Container());
    const part = pool.obtain({ x: 4, y: 2 }, dummyTextures);
    part.speedZ = 2;
    const y = part.sprite.y;
    part.update(0.25, dummyTextures);
    expect(part.sprite.x).toBe(4);
    expect(part.sprite.y).toBeLessThan(y);
  });
});

describe("PartPool", () => {
  it("reuses recycled particles, which stay in their layer", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const p1 = pool.obtain({ x: 0, y: 0 }, dummyTextures);
    p1.life = -1;
    pool.update(0.1, dummyTextures);
    expect(pool.activeCount).toBe(0);
    expect(p1.sprite.visible).toBe(false);

    expect(pool.obtain({ x: 1, y: 1 }, dummyTextures)).toBe(p1);
    expect(container.children.length).toBe(1);
  });
});

describe("RoomFire", () => {
  it("gives every floor cell a layer, placed at the cell's centre", () => {
    const fire = new RoomFire();
    const cells = floor(5, 5);
    fire.setFire("LABORATORY", cells);
    expect(fire.active).toBe(true);
    for (const c of cells) expect(fire.layerFor(c.cell)?.position).toMatchObject({ x: c.x, y: c.y });
    expect(fire.layerFor({ x: 9, y: 9 })).toBeUndefined();
    fire.destroy();
  });

  it("keeps the same fire for the same cells, moving the layers with the scene", () => {
    const fire = new RoomFire();
    const cells = floor(4, 4);
    fire.setFire("LABORATORY", cells);
    const layer = fire.layerFor({ x: 1, y: 1 });
    fire.setFire("LABORATORY", cells.map((c) => ({ ...c, x: c.x + 10 })));
    expect(fire.layerFor({ x: 1, y: 1 })).toBe(layer);
    expect(layer?.x).toBe(26);
    fire.setFire("ENGINE_ROOM", cells);
    expect(fire.layerFor({ x: 1, y: 1 })).not.toBe(layer);
    fire.destroy();
  });

  it("spawns the original's amount of fire on a 30 Hz tick, halved under reduced motion", () => {
    const cells = floor(10, 10); // 100 cells: 20 emitters, 5 to 8 flames each a tick.
    const fire = new RoomFire();
    fire.setTextures(dummyTextures);
    fire.setFire("LABORATORY", cells);
    fire.update(0.01, false);
    expect(alive(fire, cells)).toBe(0);
    fire.update(0.03, false);
    expect(alive(fire, cells)).toBeGreaterThanOrEqual(100);
    expect(alive(fire, cells)).toBeLessThanOrEqual(160);

    const calm = new RoomFire();
    calm.setTextures(dummyTextures);
    calm.setFire("LABORATORY", cells);
    calm.update(1 / 30, true);
    expect(alive(calm, cells)).toBeGreaterThanOrEqual(40);
    expect(alive(calm, cells)).toBeLessThanOrEqual(80);
    fire.destroy();
    calm.destroy();
  });

  it("burns a neighbouring room as its own fire, without thinning this room's", () => {
    const here = floor(10, 10);
    const next = floor(10, 10).map((c) => ({ ...c, cell: { x: c.cell.x + 20, y: c.cell.y }, room: "NEXT" }));
    const fire = new RoomFire();
    fire.setTextures(dummyTextures);
    fire.setFire("LABORATORY", [...here, ...next]);
    for (const c of next) expect(fire.layerFor(c.cell)).toBeDefined();
    fire.update(1 / 30, false);
    // 20 emitters for each 100-cell floor: twice one room's fire.
    expect(alive(fire, [...here, ...next])).toBeGreaterThanOrEqual(200);
    expect(alive(fire, [...here, ...next])).toBeLessThanOrEqual(320);
    fire.destroy();
  });

  it("keeps many burning neighbours to the budget, a small share still burning", () => {
    const here = floor(10, 10);
    // Eight 100-cell neighbours want 160 emitters; they get 30 between them, 3.75 each.
    const next = Array.from({ length: 8 }, (_, r) => floor(10, 10).map((c) => ({ ...c, cell: { x: c.cell.x + 20 * (r + 1), y: c.cell.y }, room: `N${r}` }))).flat();
    const fire = new RoomFire();
    fire.setTextures(dummyTextures);
    fire.setFire("LABORATORY", [...here, ...next]);
    fire.update(1 / 30, false);
    // (20 + 8 * 3) emitters, 5 to 8 flames each.
    expect(alive(fire, [...here, ...next])).toBeGreaterThanOrEqual(220);
    expect(alive(fire, [...here, ...next])).toBeLessThanOrEqual(352);
    expect(alive(fire, here)).toBeGreaterThanOrEqual(100);
    for (let r = 0; r < 8; r++) expect(alive(fire, next.filter((c) => c.room === `N${r}`))).toBeGreaterThan(0);
    fire.destroy();
  });

  it("puts out the fire, removing its layers", () => {
    const parent = new Container();
    const fire = new RoomFire();
    const cells = floor(3, 3);
    fire.setFire("LABORATORY", cells);
    parent.addChild(fire.layerFor({ x: 0, y: 0 })!);
    fire.unsetFire();
    expect(fire.active).toBe(false);
    expect(parent.children.length).toBe(0);
    expect(fire.layerFor({ x: 0, y: 0 })).toBeUndefined();
  });
});
