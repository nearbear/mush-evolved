import { Container, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { RoomSmoke, SMOKE_LIFE, SmokePool, smokeSpawns } from "../../src/iso/pixi/smoke.ts";

const dummyTexture = new Texture();

describe("smokeSpawns", () => {
  it("picks 6 points inside the footprint's isometric diamond", () => {
    const pts = smokeSpawns([2, 1]);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-32);
      expect(p.x).toBeLessThanOrEqual(32);
      expect(p.y).toBeGreaterThanOrEqual(-8);
      expect(p.y).toBeLessThanOrEqual(16);
    }
  });
});

describe("SmokePool", () => {
  it("rises, scales up, fades in then out, and recycles dead particles", () => {
    const container = new Container();
    const pool = new SmokePool(container);
    const part = pool.obtain({ x: 10, y: 20 }, dummyTexture);
    part.vx = 0;
    expect(part.sprite.visible).toBe(true);
    const startScale = part.scale;

    pool.update(0.1);
    expect(part.sprite.y).toBeLessThan(20);
    expect(part.scale).toBeGreaterThan(startScale);
    expect(part.sprite.alpha).toBeGreaterThan(0);

    pool.update(SMOKE_LIFE);
    expect(pool.active).toHaveLength(0);
    expect(part.sprite.visible).toBe(false);

    expect(pool.obtain({ x: 0, y: 0 }, dummyTexture)).toBe(part);
    expect(container.children).toHaveLength(1);
  });
});

describe("RoomSmoke", () => {
  it("creates layers for broken sources, keeps them across updates, and removes repaired ones", () => {
    const smoke = new RoomSmoke();
    smoke.setTexture(dummyTexture);

    smoke.setSmoke("ENGINE_ROOM", [
      { key: "e1", x: 50, y: 60, footprint: [2, 2], at: 1 },
      { key: "d1", x: 10, y: 20, footprint: [1, 1], at: 2 },
    ]);
    expect(smoke.active).toBe(true);
    const e1Layer = smoke.layerFor("e1");
    expect(e1Layer?.position).toMatchObject({ x: 50, y: 60 });
    expect(smoke.layerFor("d1")?.position).toMatchObject({ x: 10, y: 20 });

    // Repair d1 in the same room: e1 keeps its layer, d1 is removed.
    smoke.setSmoke("ENGINE_ROOM", [{ key: "e1", x: 52, y: 62, footprint: [2, 2], at: 1 }]);
    expect(smoke.layerFor("e1")).toBe(e1Layer);
    expect(e1Layer?.position).toMatchObject({ x: 52, y: 62 });
    expect(smoke.layerFor("d1")).toBeUndefined();

    // Advance enough ticks to spawn particles.
    for (let i = 0; i < 30; i++) smoke.update(1 / 30, false);
    expect(e1Layer!.children.length).toBeGreaterThan(0);

    smoke.unsetSmoke();
    expect(smoke.active).toBe(false);
    expect(smoke.layerFor("e1")).toBeUndefined();
    smoke.destroy();
  });
});
