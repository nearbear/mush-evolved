// Room fire particle effect (CellFire), matching the original Flash/Haxe iso client:
// Mush/clients/iso/src/fx/CellFire.hx and Mush/clients/iso/src/Grid.hx:940-975.
//
// When a room catches fire, random ground tiles (at least 8, or ~20% of the room's ground tiles, up
// to 30) get a CellFire emitter. Each emitter spawns upward-drifting flame particles from an
// object pool using the 3x3 pixel slices FX_FIRE_X and FX_FIRE_X2 from fx.png. Particles age through
// 4 temperature stages (yellow -> orange -> red -> smoke) before dissipating.

import { Container, Sprite, type Texture } from "pixi.js";

/** Lateral spread in grid units (CellFire.hx RED_X_MIN). */
export const RED_X_MIN = 1.2;

export type Temperature = "yellow" | "orange" | "red" | "smoke";

export interface GroundTilePos {
  x: number;
  y: number;
}

/**
 * Picks random ground tiles for the room's fire emitters without replacement (Grid.hx:954).
 * At least 8 (or all ground tiles if fewer), ~20% of the room's ground tiles, capped at 30.
 */
export function pickFireTiles(groundTiles: readonly GroundTilePos[]): GroundTilePos[] {
  if (groundTiles.length === 0) return [];
  const maxNb = Math.min(groundTiles.length, Math.min(30, Math.max(8, Math.round(groundTiles.length * 0.2))));
  const pool = [...groundTiles];
  const chosen: GroundTilePos[] = [];
  for (let i = 0; i < maxNb && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  return chosen;
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
  tile: GroundTilePos = { x: 0, y: 0 };
  dx = 0;
  dy = 0;
  pz = 0;

  constructor(readonly sprite: Sprite) {}

  reset(tile: GroundTilePos, textures: readonly Texture[]): void {
    this.tile = tile;
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

    this.dx = 0.6 * ((Math.random() * 2 - 1) * RED_X_MIN);
    this.dy = 0.5 * ((Math.random() * 2 - 1) * RED_X_MIN);

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
    // Iso projection: (dx - dy) * 16 along x, (dx + dy) * 8 along y, minus pz * 8 vertically (CellFire.hx:83-84)
    const px = this.tile.x + (this.dx - this.dy) * 16;
    const py = this.tile.y + (this.dx + this.dy) * 8 - this.pz * 8;
    this.sprite.position.set(Math.round(px), Math.round(py));
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
 * Object pool for Part instances to prevent GC churn during active fires.
 */
export class PartPool {
  private readonly free: Part[] = [];
  readonly active: Part[] = [];

  constructor(private readonly container: Container) {}

  get activeCount(): number {
    return this.active.length;
  }

  obtain(tile: GroundTilePos, textures: readonly Texture[]): Part {
    let p = this.free.pop();
    if (!p) {
      const sprite = new Sprite(textures[0]);
      sprite.anchor.set(0.5, 0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      p = new Part(sprite);
    }
    p.reset(tile, textures);
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

  destroy(): void {
    this.recycleAll();
    this.free.length = 0;
  }
}

/**
 * Emitter attached to one ground tile (CellFire.hx).
 */
export class CellFireEmitter {
  private spawnTimer = 0;

  constructor(readonly tile: GroundTilePos) {}

  update(dt: number, pool: PartPool, textures: readonly Texture[], reducedMotion: boolean): void {
    if (textures.length < 6) return;
    this.spawnTimer += dt;
    // Spawns on 30 Hz tick interval, matching original Flash timing
    while (this.spawnTimer >= 1 / 30) {
      this.spawnTimer -= 1 / 30;
      let count = 5 + Math.floor(Math.random() * 4); // Dice.roll(5, 8)
      if (reducedMotion) count >>= 1;
      for (let i = 0; i < count; i++) {
        pool.obtain(this.tile, textures);
      }
    }
  }
}

/**
 * Manages the isometric room fire particle emitters and particle pool for PixiRenderer.
 */
export class RoomFire {
  readonly container = new Container();
  private emitters: CellFireEmitter[] = [];
  private readonly pool: PartPool;
  private textures: Texture[] = [];
  private currentRoom: string | null = null;
  active = false;

  constructor() {
    this.pool = new PartPool(this.container);
  }

  setTextures(textures: Texture[]): void {
    this.textures = textures;
  }

  setFire(room: string, groundTiles: readonly GroundTilePos[], reducedMotion: boolean): void {
    if (this.currentRoom === room && this.emitters.length > 0) return;
    this.unsetFire();
    this.currentRoom = room;
    const chosen = pickFireTiles(groundTiles);
    for (const tile of chosen) {
      this.emitters.push(new CellFireEmitter(tile));
    }
    this.active = this.emitters.length > 0;
  }

  unsetFire(): void {
    this.emitters = [];
    this.currentRoom = null;
    this.pool.recycleAll();
    this.active = false;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (!this.active) return;
    for (const emitter of this.emitters) {
      emitter.update(dt, this.pool, this.textures, reducedMotion);
    }
    this.pool.update(dt, this.textures);
    this.active = this.emitters.length > 0 || this.pool.activeCount > 0;
  }

  destroy(): void {
    this.unsetFire();
    this.pool.destroy();
    this.container.destroy({ children: true });
  }
}
