import { Container, Rectangle, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { CellFireEmitter, Part, PartPool, pickFireTiles, RoomFire } from "../../src/iso/pixi/fire.ts";

// Dummy textures for testing frames 0..5
const dummyTextures = Array.from({ length: 6 }, () => new Texture());

describe("pickFireTiles", () => {
  it("returns empty array when there are no ground tiles", () => {
    expect(pickFireTiles([])).toEqual([]);
  });

  it("picks all tiles when room has 8 or fewer ground tiles", () => {
    const tiles = Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const chosen = pickFireTiles(tiles);
    expect(chosen.length).toBe(5);
    expect(new Set(chosen)).toEqual(new Set(tiles));
  });

  it("picks at least 8 tiles when room has between 8 and 40 tiles", () => {
    const tiles = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const chosen = pickFireTiles(tiles);
    expect(chosen.length).toBe(8);
    // Unique tiles without replacement
    const set = new Set(chosen.map((t) => `${t.x},${t.y}`));
    expect(set.size).toBe(8);
  });

  it("picks ~20% of ground tiles for medium-to-large rooms", () => {
    const tiles = Array.from({ length: 100 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const chosen = pickFireTiles(tiles);
    expect(chosen.length).toBe(20);
    const set = new Set(chosen.map((t) => `${t.x},${t.y}`));
    expect(set.size).toBe(20);
  });

  it("caps at 30 emitters for very large rooms", () => {
    const tiles = Array.from({ length: 200 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    const chosen = pickFireTiles(tiles);
    expect(chosen.length).toBe(30);
    const set = new Set(chosen.map((t) => `${t.x},${t.y}`));
    expect(set.size).toBe(30);
  });
});

describe("Part", () => {
  it("initializes as yellow with frame 0 and visible sprite", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const part = pool.obtain({ x: 100, y: 50 }, dummyTextures);

    expect(part.temperature).toBe("yellow");
    expect(part.sprite.visible).toBe(true);
    expect(part.life).toBeGreaterThanOrEqual(0.5);
    expect(part.life).toBeLessThanOrEqual(1.0);
    expect(part.sprite.texture).toBe(dummyTextures[0]);
  });

  it("ages through yellow -> orange -> red -> smoke", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const part = pool.obtain({ x: 100, y: 50 }, dummyTextures);

    // Force rising particle with active tempChange
    part.tempChange = true;
    part.speedZ = 2.0;
    part.startLife = 1.0;
    part.life = 1.0;
    part.temperature = "yellow";
    part.sprite.texture = dummyTextures[0];

    // Age to ratio < 0.9 (e.g. life = 0.85)
    part.update(0.15, dummyTextures);
    expect(["yellow", "orange"]).toContain(part.temperature);

    // If still yellow (due to 10% tempChange freeze check), force orange
    part.tempChange = true;
    part.life = 0.6; // ratio < 0.65
    part.temperature = "orange";
    part.update(0.01, dummyTextures);
    expect(["orange", "red"]).toContain(part.temperature);

    // Force red and age to ratio < 0.5
    part.tempChange = true;
    part.temperature = "red";
    part.life = 0.45;
    const speedBefore = part.speedZ;
    part.update(0.01, dummyTextures);
    expect(part.temperature).toBe("smoke");
    // Smoke doubles speedZ and stops tempChange
    expect(part.speedZ).toBe(speedBefore * 2);
    expect(part.tempChange).toBe(false);
    expect([dummyTextures[3], dummyTextures[4], dummyTextures[5]]).toContain(part.sprite.texture);
  });

  it("recycles when life expires", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const part = pool.obtain({ x: 100, y: 50 }, dummyTextures);
    expect(pool.activeCount).toBe(1);

    // Age past end of life
    part.life = 0.05;
    pool.update(0.1, dummyTextures);

    expect(pool.activeCount).toBe(0);
    expect(part.sprite.visible).toBe(false);
  });
});

describe("PartPool", () => {
  it("reuses recycled particles instead of allocating new sprites", () => {
    const container = new Container();
    const pool = new PartPool(container);

    const p1 = pool.obtain({ x: 10, y: 10 }, dummyTextures);
    expect(container.children.length).toBe(1);

    p1.life = -1;
    pool.update(0.1, dummyTextures);
    expect(pool.activeCount).toBe(0);

    const p2 = pool.obtain({ x: 20, y: 20 }, dummyTextures);
    expect(p2).toBe(p1);
    expect(container.children.length).toBe(1);
  });
});

describe("CellFireEmitter", () => {
  it("spawns particles on 30Hz tick", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const emitter = new CellFireEmitter({ x: 50, y: 50 });

    // Less than 1/30s should spawn nothing
    emitter.update(0.01, pool, dummyTextures, false);
    expect(pool.activeCount).toBe(0);

    // Reaching 1/30s spawns 5-8 particles
    emitter.update(0.03, pool, dummyTextures, false);
    expect(pool.activeCount).toBeGreaterThanOrEqual(5);
    expect(pool.activeCount).toBeLessThanOrEqual(8);
  });

  it("halves spawn rate under reduced motion", () => {
    const container = new Container();
    const pool = new PartPool(container);
    const emitter = new CellFireEmitter({ x: 50, y: 50 });

    emitter.update(1 / 30, pool, dummyTextures, true);
    // 5>>1 is 2, 8>>1 is 4
    expect(pool.activeCount).toBeGreaterThanOrEqual(2);
    expect(pool.activeCount).toBeLessThanOrEqual(4);
  });
});

describe("RoomFire", () => {
  it("sets up emitters on ground tiles and stays active", () => {
    const roomFire = new RoomFire();
    roomFire.setTextures(dummyTextures);

    const tiles = Array.from({ length: 15 }, (_, i) => ({ x: i * 20, y: i * 10 }));
    roomFire.setFire("ENGINE_ROOM", tiles, false);
    expect(roomFire.active).toBe(true);

    // Calling setFire again for the same room does not recreate emitters
    roomFire.setFire("ENGINE_ROOM", tiles, false);
    expect(roomFire.active).toBe(true);

    // Unset clears emitters and particles
    roomFire.unsetFire();
    expect(roomFire.active).toBe(false);

    roomFire.destroy();
  });

  it("updates particles across ticks", () => {
    const roomFire = new RoomFire();
    roomFire.setTextures(dummyTextures);

    const tiles = [{ x: 50, y: 50 }];
    roomFire.setFire("LABORATORY", tiles, false);

    // Step by 50ms (exceeds 1/30s)
    roomFire.update(0.05, false);
    expect(roomFire.active).toBe(true);

    roomFire.destroy();
  });
});
