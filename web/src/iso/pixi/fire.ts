// Room fire particles, after the original Flash/Haxe iso client's CellFire
// (Mush/clients/iso/src/fx/CellFire.hx and Mush/clients/iso/src/Grid.hx:940-975), but spread over the
// whole floor rather than from a few tiles: each floor cell burns as hard as a smooth noise field says
// (`fireWeights`), and flames start anywhere inside the cells. The amount of fire is the original's: as
// many flames a tick as its emitters made (`emitterCount`, 8 to 30 by floor size, 5 to 8 each).
//
// Each cell has its own layer, which the renderer puts at the cell's place in the paint order
// (`Scene.fire`), so furniture and walls in front of a cell cover what burns on it, and what burns on it
// covers what is behind. A flame stays in the layer of the cell it started in: it drifts up, not across.
// Particles are 3x3 slices FX_FIRE_X and FX_FIRE_X2 of fx.png, aging yellow, orange, red, then smoke.

import { Container, Sprite, type Texture } from "pixi.js";

export type Temperature = "yellow" | "orange" | "red" | "smoke";

/** A point in a cell's layer, in pixels from the cell's centre. */
export interface Offset {
  x: number;
  y: number;
}

/** A burning cell as the renderer is given it: its grid cell and its centre in the scene. */
export interface FireCell {
  cell: { x: number; y: number };
  x: number;
  y: number;
}

/** How many emitters the original lit for a floor this size (Grid.hx:954): at least 8 (all, if fewer), ~20%, at most 30. */
export function emitterCount(cells: number): number {
  return Math.min(cells, 30, Math.max(8, Math.round(cells * 0.2)));
}

/** A hash of a lattice point to [0, 1). */
function lattice(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1), with lattice points `scale` cells apart. */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - ix), ty = s(fy - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Noise below this burns nothing, so the fire comes in patches with calm floor between. */
const CALM = 0.35;

/**
 * How hard each cell burns, from 0 (not at all) to 1: two octaves of value noise (patches about four
 * cells across, broken up at two), cut off below `CALM`. The same seed gives the same fire; if the
 * cut leaves nothing burning, every cell burns alike.
 */
export function fireWeights(cells: readonly { x: number; y: number }[], seed: number): number[] {
  const weights = cells.map(({ x, y }) => {
    const n = (2 * valueNoise(x, y, 4, seed) + valueNoise(x, y, 2, seed + 1)) / 3;
    return Math.max(0, (n - CALM) / (1 - CALM));
  });
  return weights.some((w) => w > 0) ? weights : cells.map(() => 1);
}

/**
 * A single fire particle from an object pool (CellFire.hx Part).
 */
export class Part {
  startLife = 0;
  life = 0;
  temperature: Temperature | null = null;
  tempChange = false;
  speedZ = 0;
  at: Offset = { x: 0, y: 0 };
  pz = 0;

  constructor(readonly sprite: Sprite) {}

  reset(at: Offset, textures: readonly Texture[]): void {
    this.at = at;
    this.startLife = this.life = 0.5 + Math.random() * 0.5;
    this.temperature = null;

    // 50% chance stationary yellow ember base; 50% upward-rising aging flame (CellFire.hx:210-215).
    if (Math.random() < 0.5) {
      this.pz = 0.3 + Math.random() * 0.7; // rollF(0.3, 1)
      this.speedZ = 1.5 + (0.1 + Math.random() * 1.4); // 1.5 + rollF(0.1, 1.5)
      this.tempChange = true;
    } else {
      this.pz = 0.3;
      this.speedZ = 0;
      this.tempChange = false;
    }

    this.changeStage("yellow", textures);
    this.updatePosition();
    this.sprite.visible = true;
  }

  changeStage(st: Temperature, textures: readonly Texture[]): void {
    this.temperature = st;
    // 50% chance rot 0 (FX_FIRE_X) vs rot 45 deg (FX_FIRE_X2) (CellFire.hx:64)
    const isX2 = Math.random() < 0.5;
    this.sprite.rotation = isX2 ? Math.PI / 4 : 0;

    let frame = 0;
    switch (st) {
      case "yellow":
        frame = 0;
        break;
      case "orange":
        frame = 1;
        break;
      case "red":
        frame = 2;
        break;
      case "smoke":
        // Smoke frames 3-5 (CellFire.hx:70)
        frame = 3 + Math.floor(Math.random() * 3);
        break;
    }

    if (textures[frame]) {
      this.sprite.texture = textures[frame]!;
    }
  }

  private updatePosition(): void {
    // Rising pz * 8 pixels up the screen (CellFire.hx:83-84).
    this.sprite.position.set(Math.round(this.at.x), Math.round(this.at.y - this.pz * 8));
  }

  update(dt: number, textures: readonly Texture[]): void {
    this.life -= dt;
    if (this.speedZ > 0) {
      this.pz += this.speedZ * dt;
      this.updatePosition();
    }

    const ratio = this.life / this.startLife;
    if (this.tempChange) {
      if (ratio < 0.9 && this.temperature === "yellow") {
        if (Math.random() < 0.1) this.tempChange = false;
        this.changeStage("orange", textures);
      } else if (ratio < 0.65 && this.temperature === "orange") {
        if (Math.random() < 0.2) this.tempChange = false;
        this.changeStage("red", textures);
      } else if (ratio < 0.5 && this.temperature === "red") {
        this.speedZ *= 2.0;
        this.changeStage("smoke", textures);
        this.tempChange = false;
      }
    }
  }
}

/**
 * Object pool for Part instances to prevent GC churn during active fires. One per cell layer: a
 * particle's sprite stays a child of its layer, so reusing it never moves it between layers.
 */
export class PartPool {
  private readonly free: Part[] = [];
  readonly active: Part[] = [];

  constructor(private readonly container: Container) {}

  get activeCount(): number {
    return this.active.length;
  }

  obtain(at: Offset, textures: readonly Texture[]): Part {
    let p = this.free.pop();
    if (!p) {
      const sprite = new Sprite(textures[0]);
      sprite.anchor.set(0.5, 0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      p = new Part(sprite);
    }
    p.reset(at, textures);
    this.active.push(p);
    return p;
  }

  recycle(p: Part): void {
    p.sprite.visible = false;
    this.free.push(p);
  }

  recycleAll(): void {
    for (const p of this.active) {
      p.sprite.visible = false;
      this.free.push(p);
    }
    this.active.length = 0;
  }

  update(dt: number, textures: readonly Texture[]): void {
    let writeIdx = 0;
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i]!;
      p.update(dt, textures);
      if (p.life > 0) {
        this.active[writeIdx++] = p;
      } else {
        this.recycle(p);
      }
    }
    this.active.length = writeIdx;
  }
}

/** One burning cell's layer and the particles in it. */
interface CellLayer {
  readonly container: Container;
  readonly pool: PartPool;
}

const cellKey = (c: { x: number; y: number }) => `${c.x},${c.y}`;

/** A random point inside a cell's diamond, from its centre: half a cell either way along each grid axis. */
function pointInCell(): Offset {
  const u = Math.random() - 0.5, v = Math.random() - 0.5;
  return { x: (u - v) * 16, y: (u + v) * 8 };
}

/**
 * The fire in the room being viewed: a layer per floor cell (`layerFor`, for the renderer to put in
 * the paint order), and the flames spawned into them on the original's 30 Hz tick.
 */
export class RoomFire {
  private readonly layers = new Map<string, CellLayer>();
  /** The burning cells' layers and how hard each burns, summed, to pick where each flame starts. */
  private burning: CellLayer[] = [];
  private cumulative: number[] = [];
  private perTick = 0;
  private spawnTimer = 0;
  private textures: Texture[] = [];
  private room: string | null = null;
  private cellsKey = "";
  active = false;

  setTextures(textures: Texture[]): void {
    this.textures = textures;
  }

  /**
   * The room's floor cells while it is on fire. A new room, or new cells, lights a new fire (a new
   * noise seed); the same ones only move the layers, should the scene's origin have moved.
   */
  setFire(room: string, cells: readonly FireCell[]): void {
    const key = cells.map((c) => cellKey(c.cell)).join(";");
    if (room !== this.room || key !== this.cellsKey) {
      this.unsetFire();
      this.room = room;
      this.cellsKey = key;
      const weights = fireWeights(
        cells.map((c) => c.cell),
        Math.floor(Math.random() * 2 ** 31),
      );
      let sum = 0;
      cells.forEach((c, i) => {
        const container = new Container();
        const layer = { container, pool: new PartPool(container) };
        this.layers.set(cellKey(c.cell), layer);
        if (weights[i]! <= 0) return;
        sum += weights[i]!;
        this.burning.push(layer);
        this.cumulative.push(sum);
      });
      this.perTick = emitterCount(cells.length);
      this.active = this.burning.length > 0;
    }
    for (const c of cells) this.layers.get(cellKey(c.cell))!.container.position.set(Math.round(c.x), Math.round(c.y));
  }

  /** The layer drawing what burns on a cell, while the room is on fire. */
  layerFor(cell: { x: number; y: number }): Container | undefined {
    return this.layers.get(cellKey(cell))?.container;
  }

  unsetFire(): void {
    for (const { container } of this.layers.values()) {
      container.removeFromParent();
      container.destroy({ children: true });
    }
    this.layers.clear();
    this.burning = [];
    this.cumulative = [];
    this.perTick = 0;
    this.spawnTimer = 0;
    this.room = null;
    this.cellsKey = "";
    this.active = false;
  }

  /** A burning cell, picked by how hard it burns. */
  private pick(): CellLayer {
    const total = this.cumulative[this.cumulative.length - 1]!;
    const r = Math.random() * total;
    let lo = 0, hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid]! <= r) lo = mid + 1;
      else hi = mid;
    }
    return this.burning[lo]!;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (!this.active) return;
    if (this.textures.length >= 6) {
      this.spawnTimer += dt;
      // Spawns on a 30 Hz tick, as the original did: 5 to 8 flames per emitter it would have had.
      while (this.spawnTimer >= 1 / 30) {
        this.spawnTimer -= 1 / 30;
        for (let e = 0; e < this.perTick; e++) {
          let count = 5 + Math.floor(Math.random() * 4); // Dice.roll(5, 8)
          if (reducedMotion) count >>= 1;
          for (let i = 0; i < count; i++) this.pick().pool.obtain(pointInCell(), this.textures);
        }
      }
    }
    for (const layer of this.burning) layer.pool.update(dt, this.textures);
  }

  destroy(): void {
    this.unsetFire();
  }
}
