// Broken-equipment and broken-door smoke particles, after the original Flash/Haxe iso client's
// SmokeEmitter (Mush/clients/iso/src/fx/SmokeEmitter.hx and Mush/clients/iso/src/Grid.hx:337-347).
// Each broken entity picks up to 6 spawn points in its isometric footprint and spawns 16x16
// FX_SMOKE puffs on the original's 30 Hz tick.

import { Container, Sprite, type Texture } from "pixi.js";
import { gridToPx } from "../placement.ts";
import type { SceneSmokeSource } from "../scene.ts";

/** Original Flash tick rate (Hz) used to convert per-tick constants to seconds. */
const TICK_HZ = 30;
/** Particle lifetime in seconds (SmokeEmitter.BASE_LIFE = 40 ticks). */
export const SMOKE_LIFE = 40 / TICK_HZ;
/** Fade-in duration in seconds (fadeIn(2) ticks). */
const FADE_IN = 2 / TICK_HZ;
/** Scale multiplier per 30 Hz tick (sfr = 1.04). */
const SCALE_RATE = 1.04;
/** Spawn probability per 30 Hz tick (Dice.percent(40)). */
const SPAWN_CHANCE = 0.4;
/** Maximum precomputed spawn points per emitter. */
const MAX_SPAWNS = 6;

/** A single smoke puff from an object pool (SmokPart in SmokeEmitter.hx). */
export class SmokePart {
  life = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  scale = 0.4;
  untinted = false;

  constructor(readonly sprite: Sprite) {}

  reset(at: { x: number; y: number }, texture: Texture): void {
    this.life = SMOKE_LIFE;
    this.px = at.x;
    this.py = at.y;
    this.vx = (0.5 - Math.random()) * 0.275 * TICK_HZ;
    this.vy = -0.8 * TICK_HZ;
    this.scale = 0.4 + Math.random() * 0.1;
    // 1 in 4 particles stays untinted; the rest darken-to-lighten from 0x77 to 0xFF (SmokPart).
    this.untinted = Math.floor(Math.random() * 4) === 3;

    this.sprite.texture = texture;
    this.sprite.position.set(Math.round(this.px), Math.round(this.py));
    this.sprite.scale.set(this.scale);
    this.sprite.alpha = 0;
    this.sprite.tint = this.untinted ? 0xffffff : 0x777777;
    this.sprite.visible = true;
  }

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) return;

    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.scale *= Math.pow(SCALE_RATE, dt * TICK_HZ);

    const iratio = Math.max(0, this.life / SMOKE_LIFE);
    const fadeIn = Math.min(1, (SMOKE_LIFE - this.life) / FADE_IN);
    this.sprite.position.set(Math.round(this.px), Math.round(this.py));
    this.sprite.scale.set(this.scale);
    this.sprite.alpha = iratio * fadeIn;

    if (!this.untinted) {
      const val = Math.round(0x77 + (0xff - 0x77) * (1 - iratio));
      this.sprite.tint = (val << 16) | (val << 8) | val;
    }
  }
}

/** Object pool of smoke particles belonging to a single emitter's container. */
export class SmokePool {
  private readonly free: SmokePart[] = [];
  readonly active: SmokePart[] = [];

  constructor(private readonly container: Container) {}

  obtain(at: { x: number; y: number }, texture: Texture): SmokePart {
    let p = this.free.pop();
    if (!p) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      p = new SmokePart(sprite);
    }
    p.reset(at, texture);
    this.active.push(p);
    return p;
  }

  update(dt: number): void {
    let writeIdx = 0;
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i]!;
      p.update(dt);
      if (p.life > 0) {
        this.active[writeIdx++] = p;
      } else {
        p.sprite.visible = false;
        this.free.push(p);
      }
    }
    this.active.length = writeIdx;
  }
}

/** Precomputed spawn points inside an entity's isometric footprint. */
export function smokeSpawns(footprint: readonly [number, number]): { x: number; y: number }[] {
  const [w, h] = footprint;
  return Array.from({ length: MAX_SPAWNS }, () => gridToPx(1 - Math.random() * w, 1 - Math.random() * h));
}

interface Emitter {
  readonly container: Container;
  readonly pool: SmokePool;
  readonly spawns: readonly { x: number; y: number }[];
}

/**
 * Smoke emitters for every broken door and broken equipment in the room being viewed.
 * Each emitter owns a `Container` placed in the scene's paint order right after its sprite.
 */
export class RoomSmoke {
  private readonly emitters = new Map<string, Emitter>();
  private spawnTimer = 0;
  private texture: Texture | null = null;
  private room: string | null = null;
  active = false;

  setTexture(texture: Texture): void {
    this.texture = texture;
  }

  /** Syncs emitters with the current room's broken sources, keeping existing emitters alive across non-repair updates. */
  setSmoke(room: string, sources: readonly SceneSmokeSource[]): void {
    if (room !== this.room) {
      this.unsetSmoke();
      this.room = room;
    }
    const wanted = new Set(sources.map((s) => s.key));
    for (const [key, emitter] of this.emitters) {
      if (wanted.has(key)) continue;
      emitter.container.removeFromParent();
      emitter.container.destroy({ children: true });
      this.emitters.delete(key);
    }
    for (const s of sources) {
      let emitter = this.emitters.get(s.key);
      if (!emitter) {
        const container = new Container();
        emitter = { container, pool: new SmokePool(container), spawns: smokeSpawns(s.footprint) };
        this.emitters.set(s.key, emitter);
      }
      emitter.container.position.set(Math.round(s.x), Math.round(s.y));
    }
    this.active = this.emitters.size > 0;
  }

  /** The layer drawing smoke for `key`, if that sprite is currently smoking. */
  layerFor(key: string): Container | undefined {
    return this.emitters.get(key)?.container;
  }

  unsetSmoke(): void {
    for (const { container } of this.emitters.values()) {
      container.removeFromParent();
      container.destroy({ children: true });
    }
    this.emitters.clear();
    this.spawnTimer = 0;
    this.room = null;
    this.active = false;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (!this.active) return;
    if (this.texture) {
      this.spawnTimer += dt;
      const chance = reducedMotion ? SPAWN_CHANCE / 2 : SPAWN_CHANCE;
      while (this.spawnTimer >= 1 / TICK_HZ) {
        this.spawnTimer -= 1 / TICK_HZ;
        for (const emitter of this.emitters.values()) {
          if (Math.random() < chance) {
            const pt = emitter.spawns[Math.floor(Math.random() * emitter.spawns.length)]!;
            emitter.pool.obtain(pt, this.texture);
          }
        }
      }
    }
    for (const emitter of this.emitters.values()) emitter.pool.update(dt);
  }

  destroy(): void {
    this.unsetSmoke();
  }
}
