// PixiJS renderer for the iso room (#194), imperative: one Pixi Sprite per scene sprite, kept
// between scenes by key, so a scene change only touches what changed and walking only moves
// sprites. It draws the Scene it is given over a star field (starfield.ts) and nothing else: no input (the canvas ignores pointer
// events; IsoRoom hit-tests), no game state. Pixi stays inside this folder.
//
// Pixel-exact at 1x: nearest-neighbour textures, the canvas at devicePixelRatio with CSS size equal
// to the panel, and whole-pixel positions, rounded here rather than left to Pixi's roundPixels. That
// rounds each sprite corner on the GPU after a float round trip, so a half pixel (placement centres
// odd-sized slices on one; the camera and walkers move by fractions) rounds up at some screen heights
// and down at others: neighbouring tiles come apart by 1px in bands across the screen. It renders on demand, not on a ticker: on
// each frame update (walking), when a texture arrives, and when an animation steps.
//
// Effects (effects.ts): fog is a tint; hover, selection and shadows are shared filters (filters.ts);
// the see-through outlines are a second layer over every sprite, each outline shown only while a wall
// covers its person. The pulse of those outlines keeps it rendering every frame while one shows, and so
// does a floating sprite (a drone's bob, `SceneSprite.bob`), though it only redraws when one moves a pixel.
//
// WebGL context loss (a phone backgrounding the tab, a GPU reset): Pixi keeps the context restorable
// and rebuilds its textures and programs when it comes back. This only stops drawing while it is lost
// and draws once it is back, since nothing else would ask for a frame.

import { Application, Container, type Filter, Rectangle, RendererType, Sprite, Texture, TextureStyle, TilingSprite, UniformGroup } from "pixi.js";
// Pixi's shader code without `new Function`, which the CSP forbids (web/public/_headers).
import "pixi.js/unsafe-eval";
import { FX_SHEET } from "../../art/assets.ts";
import { keyedUrl } from "../../art/keyedSprite.ts";
import { animId, animStep, type Cutaway, frameAt, PACE_SPEED, type FrameUpdate, type Scene, type SceneImage, type SceneOutline, type ScenePicture, type SceneSprite, type ShipTurn } from "../scene.ts";
import { shiftTile, stepTurn, tilePosition, type TurnLimits } from "../skyTurn.ts";
import { starfield, starLayer } from "../starfield.ts";
import { ESP, espPulse, filterKey, lookOf } from "./effects.ts";
import { cutawayFilter, EspFilters, lookFilter } from "./filters.ts";
import { RoomFire } from "./fire.ts";
import { RoomSmoke } from "./smoke.ts";

TextureStyle.defaultOptions.scaleMode = "nearest";

/** A floating sprite (`SceneSprite.bob`, a drone) rises and falls this many pixels either way, once every `BOB_MS`. */
const BOB_PX = 2;
const BOB_MS = 1600;

/** Where in its bob a floating sprite is at `now`: whole pixels, so it stays crisp, and out of step with others by key. */
function bobAt(key: string, now: number): number {
  let phase = 0;
  for (let i = 0; i < key.length; i++) phase = (phase * 31 + key.charCodeAt(i)) >>> 0;
  return Math.round(BOB_PX * Math.sin(((now / BOB_MS) + (phase % 1000) / 1000) * 2 * Math.PI));
}

// Textures are shared by every renderer instance (a remount, the room you left): images load once.
const images = new Map<string, Promise<Texture>>();
const frames = new Map<string, Texture>();

function imageTexture(url: string, keyed: boolean): Promise<Texture> {
  const key = `${keyed ? "k" : ""}|${url}`;
  let t = images.get(key);
  if (!t) {
    t = (keyed ? keyedUrl(url) : Promise.resolve(url)).then(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return Texture.from(img);
    });
    images.set(key, t);
  }
  return t;
}

/** The sub-texture for one frame of a loaded image, made once per frame. */
function frameTexture(base: Texture, key: string, sx: number, sy: number, width: number, height: number): Texture {
  let t = frames.get(key);
  if (!t) {
    t = new Texture({ source: base.source, frame: new Rectangle(sx, sy, width, height) });
    frames.set(key, t);
  }
  return t;
}

/** The star field's tile, in pixels, and how far it moves for each pixel the camera moves. */
const SKY_SIZE = 1024;
const STARS_SIZE = 512;
/** The dust moves at this fraction of the camera, the stars over it at this one: nearer moves more. */
const SKY_PARALLAX = 0.25;
const STARS_PARALLAX = 0.6;
/** How fast each layer streams past at cruising pace (pixels a second, along x; they run down-right, upper left to bottom right, at the iso grid's 2:1 slope), and how long a change of speed takes to ease in and out (seconds). */
const SKY_DRIFT = 12;
const STARS_DRIFT = 40;
const EASE_SECONDS = 3;
/**
 * When the ship turns a quarter, the stars turn a quarter the other way: speeding up to at most `speed` (radians a
 * second) and slowing to a stop at `accel` (radians a second, each second), so a quarter turn takes about 9.5 s.
 */
const TURN: TurnLimits = { speed: 0.24, accel: 0.08 };
let skyTexture: Texture | null = null;
let starsTexture: Texture | null = null;

/** The star field behind the ship, made once (about 0.1 s) and repeated across the panel. */
function sky(): Texture {
  if (!skyTexture) {
    const { size, rgba } = starfield(SKY_SIZE);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.putImageData(new ImageData(rgba, size, size), 0, 0);
    skyTexture = Texture.from(canvas);
  }
  return skyTexture;
}

/** The near stars over the sky, made once. */
function stars(): Texture {
  if (!starsTexture) {
    const { size, rgba } = starLayer(STARS_SIZE);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.putImageData(new ImageData(rgba, size, size), 0, 0);
    starsTexture = Texture.from(canvas);
  }
  return starsTexture;
}

interface Drawn {
  sprite: Sprite;
  pic: ScenePicture;
  /** The animation frame showing, and when the animation started. */
  frame: number;
  animStart: number;
  /** The texture this sprite should show, so a late load doesn't overwrite a newer one. */
  textureKey: string;
  /** A floating sprite's current lift off where the scene placed it, in pixels. */
  bobY?: number;
}

/**
 * One layer of the star field. `at` is where its tile sits, kept in the tile's own frame (turned with the stars), so
 * the layer always turns about the panel's centre and streams down-right on screen whichever way it has turned.
 */
interface SkyLayer {
  sprite: TilingSprite;
  parallax: number;
  rate: number;
  size: number;
  /** The tile's offset in its own turned frame (skyTurn.ts). */
  at: { x: number; y: number };
}

/** Outlines are kept in the same map as sprites, under their own keys. */
const OUTLINE = "esp|";

export class PixiRenderer {
  private readonly app = new Application();
  /** The dust, then the near stars. */
  private sky: SkyLayer[] = [];
  /**
   * How far the stars have turned (radians, clockwise), how fast they are turning (radians a second), where they should
   * end up, and the last turn seen (`Scene.turn.n`; null before the first scene).
   */
  private angle = 0;
  private spin = 0;
  private heading = 0;
  private turnSeen: number | null = null;
  /** The orbited planet, in the sky behind the ship at the panel's bottom-right; `planetUrl` is the one it should show. */
  private readonly planet = new Sprite(Texture.EMPTY);
  private planetUrl: string | null = null;
  /** Stream speed as a multiple of cruising (0 in orbit), easing toward `cruise`. */
  private speed = 0;
  private cruise = 0;
  /** Where the current change of speed began, and how far through it (0 to 1): the speed follows a smoothstep between. */
  private speedFrom = 0;
  private ramp = 1;
  /** Whether a scene has set the pace yet: the first one starts the stream at speed rather than easing up to it. */
  private paceSeen = false;
  private lastTick = 0;
  private camera = { x: 0, y: 0 };
  private readonly world = new Container();
  private readonly ground = new Container();
  private readonly sprites = new Container();
  private readonly outlines = new Container();
  private readonly fire = new RoomFire();
  private readonly smoke = new RoomSmoke();
  private readonly drawn = new Map<string, Drawn>();
  private groundOrder: Drawn[] = [];
  private order: Drawn[] = [];
  private outlineOrder: Drawn[] = [];
  private walkers: Drawn[] = [];
  private animated: Drawn[] = [];
  private bobbing: Drawn[] = [];
  private scene: Scene | null = null;
  private lastFrame: FrameUpdate | null = null;
  private ready = false;
  private destroyed = false;
  private dirty = false;
  private lost = false;
  /** Images still loading; the host says `data-art="ready"` once none are and a frame is drawn (tools/src/play waits on it). */
  private loading = 0;
  private raf = 0;
  private resize: ResizeObserver | null = null;
  /** Filters by look (filterKey), cutaway filters by axis+padding, and the outlines' two, made once the renderer is up. */
  private readonly looks = new Map<string, Filter>();
  private readonly cutaways = new Map<string, Filter>();
  private readonly cameraUniforms = new UniformGroup({ uCamera: { value: new Float32Array([0, 0]), type: "vec2<f32>" } });
  private esp: { pulsing: EspFilters; faint: EspFilters } | null = null;
  /** Whether any outline that pulses is showing, which keeps frames coming. */
  private pulsing = false;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(private readonly host: HTMLElement) {
    this.init().catch((e: unknown) => console.error("Pixi renderer failed to start", e));
  }

  private async init() {
    await this.app.init({
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      roundPixels: true,
      autoStart: false,
      preference: "webgl",
    });
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      return;
    }
    // Pixi's own input handling is unused: IsoRoom hit-tests against the art itself.
    this.app.stage.eventMode = "none";
    this.world.addChild(this.ground, this.sprites, this.outlines);
    void imageTexture(FX_SHEET, false).then((base) => {
      if (this.destroyed) return;
      const fireTextures = Array.from({ length: 6 }, (_, i) => frameTexture(base, `fx_fire_${i}`, 5 + i * 3, 0, 3, 3));
      this.fire.setTextures(fireTextures);
      this.smoke.setTexture(frameTexture(base, "fx_smoke", 240, 48, 16, 16));
      if (this.fire.active || this.smoke.active) this.requestRender();
    });
    const layer = (texture: Texture, size: number, parallax: number, rate: number): SkyLayer => ({
      sprite: new TilingSprite({ texture, width: this.app.screen.width, height: this.app.screen.height }),
      parallax,
      rate,
      size,
      at: { x: 0, y: 0 },
    });
    this.sky = [layer(sky(), SKY_SIZE, SKY_PARALLAX, SKY_DRIFT), layer(stars(), STARS_SIZE, STARS_PARALLAX, STARS_DRIFT)];
    this.planet.visible = false;
    this.app.stage.addChild(...this.sky.map((l) => l.sprite), this.planet, this.world);
    // The shaders are GLSL; on anything but WebGL the sprites are drawn without effects.
    if (this.app.renderer.type === RendererType.WEBGL) {
      const rim = this.color("--glow-rim");
      const resolution = this.app.renderer.resolution;
      this.esp = { pulsing: new EspFilters(rim, 1, resolution), faint: new EspFilters(rim, ESP.faint, resolution) };
    }
    this.app.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.app.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.host.appendChild(this.app.canvas);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.host);
    this.ready = true;
    if (this.scene) this.setScene(this.scene);
    if (this.lastFrame) this.setFrame(this.lastFrame);
    this.fit();
  }

  /** Match the canvas to the panel. A panel hidden with CSS (phone tabs) measures 0: leave it be. */
  private fit() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!this.ready || !w || !h) return;
    if (this.app.renderer.width !== w || this.app.renderer.height !== h) this.app.renderer.resize(w, h);
    for (const l of this.sky) l.sprite.setSize(w, h);
    this.placeSky();
    this.placePlanet();
    this.renderNow();
  }

  setScene(scene: Scene) {
    this.scene = scene;
    if (!this.ready) return;
    const cruise = this.reducedMotion.matches ? 0 : PACE_SPEED[scene.pace];
    if (!this.paceSeen) {
      this.paceSeen = true;
      this.speed = cruise;
    } else if (cruise !== this.cruise) {
      this.speedFrom = this.speed;
      this.ramp = 0;
    }
    this.cruise = cruise;
    if (this.speed !== this.cruise) this.requestRender();
    this.noteTurn(scene.turn);
    this.setPlanet(scene.planet);
    const seen = new Set<string>();
    const groundPics = scene.sprites.filter((s) => s.kind === "ground");
    const spritePics = scene.sprites.filter((s) => s.kind !== "ground");
    const ground = this.sync(groundPics, "", this.ground, this.groundOrder, seen, (d, s) => this.paintSprite(d, s));
    const sprites = this.sync(spritePics, "", this.sprites, this.order, seen, (d, s) => this.paintSprite(d, s));
    const outlines = this.sync(scene.outlines, OUTLINE, this.outlines, this.outlineOrder, seen, (d, o) => this.paintOutline(d, o));
    if (scene.fire.length) this.fire.setFire(scene.room, scene.fire);
    else this.fire.unsetFire();
    if (scene.smoke.length) this.smoke.setSmoke(scene.room, scene.smoke);
    else this.smoke.unsetSmoke();
    this.arrange(this.sprites, this.withParticles(scene, sprites));
    for (const [key, d] of this.drawn) {
      if (seen.has(key)) continue;
      d.sprite.destroy();
      this.drawn.delete(key);
    }
    this.groundOrder = ground;
    this.order = sprites;
    this.outlineOrder = outlines;
    const all = [...ground, ...sprites, ...outlines];
    this.walkers = all.filter((d) => d.pic.walker);
    this.animated = all.filter((d) => d.pic.anim);
    this.bobbing = sprites.filter((d) => (d.pic as SceneSprite).bob);
    this.pulsing = scene.outlines.some((o) => o.occluded && !o.faint);
    this.requestRender();
  }

  /** One layer's pictures: reused by key (an animation restarts when it changes), painted and placed. */
  private sync<P extends ScenePicture>(pics: readonly P[], prefix: string, layer: Container, prev: Drawn[], seen: Set<string>, paint: (d: Drawn, pic: P) => void): Drawn[] {
    const now = performance.now();
    const next: Drawn[] = [];
    for (const pic of pics) {
      const key = prefix + pic.key;
      seen.add(key);
      let d = this.drawn.get(key);
      if (!d) {
        d = { sprite: new Sprite(Texture.EMPTY), pic, frame: -1, animStart: now, textureKey: "" };
        this.drawn.set(key, d);
      } else if (animId(d.pic.anim) !== animId(pic.anim)) {
        d.animStart = now;
      }
      d.pic = pic;
      d.frame = pic.anim ? animStep(pic.anim, now - d.animStart).frame : 0;
      paint(d, pic);
      this.setTexture(d, pic.image, d.frame);
      this.place(d, { x: 0, y: 0 });
      d.bobY = 0;
      next.push(d);
    }
    if (layer !== this.sprites) this.arrange(layer, next.map((d) => d.sprite));
    return next;
  }

  /**
   * The sprites layer's children: its sprites, with each fire or smoke layer placed at its spot in the
   * paint order. Indices in `scene.fire` and `scene.smoke` count every scene sprite, floors included.
   */
  private withParticles(scene: Scene, sprites: readonly Drawn[]): Container[] {
    if (!scene.fire.length && !scene.smoke.length) return sprites.map((d) => d.sprite);
    // The index among the non-floor sprites of each scene sprite position.
    const upTo = new Int32Array(scene.sprites.length + 1);
    scene.sprites.forEach((s, i) => {
      upTo[i + 1] = upTo[i]! + (s.kind === "ground" ? 0 : 1);
    });
    const before = new Map<number, Container[]>();
    const addLayer = (at: number, layer: Container | undefined) => {
      if (!layer) return;
      const i = upTo[at]!;
      const list = before.get(i);
      if (list) list.push(layer);
      else before.set(i, [layer]);
    };
    for (const c of scene.fire) addLayer(c.at, this.fire.layerFor(c.cell));
    for (const s of scene.smoke) addLayer(s.at, this.smoke.layerFor(s.key));
    const out: Container[] = [];
    sprites.forEach((d, i) => {
      out.push(...(before.get(i) ?? []), d.sprite);
    });
    out.push(...(before.get(sprites.length) ?? []));
    return out;
  }

  /** Paint order is child order; re-add only when it changed. */
  private arrange(layer: Container, children: readonly Container[]) {
    if (children.length === layer.children.length && children.every((c, i) => c === layer.children[i])) return;
    layer.removeChildren();
    if (children.length) layer.addChild(...children);
  }

  setFrame(frame: FrameUpdate) {
    this.lastFrame = frame;
    if (!this.ready) return;
    const { camera } = frame;
    const x = Math.round(camera.x);
    const y = Math.round(camera.y);
    this.world.position.set(x, y);
    const cam = this.cameraUniforms.uniforms.uCamera as Float32Array;
    cam[0] = x;
    cam[1] = y;
    if (!this.reducedMotion.matches) {
      const dx = camera.x - this.camera.x;
      const dy = camera.y - this.camera.y;
      this.shiftSky((l) => ({ x: dx * l.parallax, y: dy * l.parallax }));
    }
    this.camera = camera;
    this.placeSky();
    // Each walker is rounded where it lands on screen, not in the world: your own walker cancels the
    // camera's fraction exactly, so you stay still on screen while the room moves under you.
    for (const d of this.walkers) {
      const o = frame.offsetOf(d.pic.walker!);
      this.place(d, { x: Math.round(o.x + camera.x) - x, y: Math.round(o.y + camera.y) - y });
    }
    // Drawn now, in the same frame as the DOM overlay above it, so badges and people stay together.
    this.renderNow();
  }

  /** Shows the orbited planet once its image is in, or hides it. */
  private setPlanet(url: string | null) {
    if (url === this.planetUrl) return;
    this.planetUrl = url;
    if (!url) {
      this.planet.visible = false;
      return;
    }
    this.loading++;
    this.host.dataset.art = "loading";
    void imageTexture(url, false)
      .then(
        (texture) => {
          if (this.destroyed || this.planetUrl !== url) return;
          this.planet.texture = texture;
          this.planet.visible = true;
          this.placePlanet();
        },
        (e: unknown) => console.error(`Pixi renderer: can't load ${url}`, e),
      )
      .finally(() => {
        this.loading--;
        this.requestRender();
      });
  }

  /** Pinned to the panel's bottom-right corner, in whole pixels; it doesn't move with the camera. */
  private placePlanet() {
    const { width, height } = this.app.screen;
    this.planet.position.set(Math.round(width - this.planet.texture.width), Math.round(height - this.planet.texture.height));
  }

  /**
   * A new turn of the ship (`Scene.turn`) turns the stars a quarter the other way: left turns them clockwise. The
   * first scene only notes where the count stands, so loading in doesn't replay the last turn.
   */
  private noteTurn(turn: ShipTurn | null) {
    const seen = this.turnSeen;
    this.turnSeen = turn?.n ?? 0;
    if (seen === null || !turn || turn.n <= seen) return;
    this.heading += ((turn.side === "left" ? 1 : -1) * Math.PI) / 2;
    if (this.reducedMotion.matches) {
      this.angle = this.heading;
      this.spin = 0;
      this.placeSky();
    }
    this.requestRender();
  }

  /** Whether the stars are still turning toward `heading`. */
  private turning() {
    return this.angle !== this.heading || this.spin !== 0;
  }

  /** Moves each layer by `by(layer)` on screen: turned back into the tile's frame, so it moves that way whatever the angle. */
  private shiftSky(by: (l: SkyLayer) => { x: number; y: number }) {
    for (const l of this.sky) l.at = shiftTile(l.at, by(l), this.angle, l.size);
  }

  /**
   * The layers follow the camera slower than the ship, stream down-right at the ship's speed, and are turned by
   * `angle` about the panel's centre. In whole pixels unless a turn is under way.
   */
  private placeSky() {
    const center = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
    const whole = this.turning() ? (v: number) => v : Math.round;
    for (const l of this.sky) {
      const p = tilePosition(l.at, this.angle, center);
      l.sprite.tilePosition.set(whole(p.x), whole(p.y));
      l.sprite.tileRotation = this.angle;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    if (this.ready) {
      this.app.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      this.app.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    }
    // Textures stay cached for the next renderer; only this one's sprites and filters go.
    if (this.ready) this.app.destroy({ removeView: true }, { children: true });
    for (const f of this.looks.values()) f.destroy();
    for (const f of this.cutaways.values()) f.destroy();
    this.esp?.pulsing.destroy();
    this.esp?.faint.destroy();
    this.fire.destroy();
    this.smoke.destroy();
  }

  /** A color token from styles/tokens.css, as the page has it. */
  private color(token: string): string {
    return getComputedStyle(this.host).getPropertyValue(token).trim() || "#ffffff";
  }

  /**
   * Position and mirroring: a mirrored sprite is scaled by -1, so it is anchored on its far edge.
   * `offset` is in whole pixels; the scene's own position is rounded the way the DOM snaps it.
   */
  private place(d: Drawn, offset: { x: number; y: number }) {
    const { pic, sprite } = d;
    sprite.scale.set(pic.flipX ? -1 : 1, pic.flipY ? -1 : 1);
    const x = Math.round(pic.x) + offset.x + (pic.flipX ? pic.width : 0);
    const y = Math.round(pic.y) + offset.y + (pic.flipY ? pic.height : 0);
    sprite.position.set(x, y);
  }

  private getCutawayFilter(cut: Cutaway): Filter {
    const key = `${cut.axis}|${cut.x},${cut.y},${cut.width},${cut.height}`;
    let filter = this.cutaways.get(key);
    if (!filter) {
      filter = cutawayFilter(cut, this.cameraUniforms, this.app.renderer.resolution);
      this.cutaways.set(key, filter);
    }
    return filter;
  }

  /** Fog as a tint; anything else as the filter for that look, shared with every sprite that has it. */
  private paintSprite(d: Drawn, s: SceneSprite) {
    const look = lookOf(s);
    d.sprite.tint = look.tint;
    const key = this.esp ? filterKey(look) : "";
    let filter = key ? this.looks.get(key) : undefined;
    if (key && !filter) {
      filter = lookFilter(look, (token) => this.color(token), this.app.renderer.resolution);
      this.looks.set(key, filter);
    }
    const next: Filter[] = [];
    if (filter) next.push(filter);
    if (s.cutaway && this.esp) next.push(this.getCutawayFilter(s.cutaway));
    const cur = d.sprite.filters ?? [];
    if (cur.length !== next.length || cur.some((f, i) => f !== next[i])) {
      d.sprite.filters = next;
    }
  }

  /** Shown only while a wall covers the person; faint for someone in another room, which doesn't pulse. */
  private paintOutline(d: Drawn, o: SceneOutline) {
    d.sprite.visible = o.occluded && !!this.esp;
    if (!this.esp) return;
    const filters = (o.faint ? this.esp.faint : this.esp.pulsing).filters;
    if (d.sprite.filters !== filters) d.sprite.filters = filters;
  }

  private setTexture(d: Drawn, image: SceneImage, frame: number) {
    const { url, keyed, frame: f } = image;
    if (!url) {
      d.sprite.texture = Texture.EMPTY;
      return;
    }
    const { sx, sy } = frameAt(image, frame);
    const key = `${keyed ? "k" : ""}|${url}|${sx},${sy},${f.width},${f.height}`;
    if (key === d.textureKey) return;
    d.textureKey = key;
    const ready = frames.get(key);
    if (ready) {
      d.sprite.texture = ready;
      return;
    }
    this.loading++;
    this.host.dataset.art = "loading";
    void imageTexture(url, keyed)
      .then(
        (base) => {
          if (this.destroyed || d.textureKey !== key) return;
          d.sprite.texture = frameTexture(base, key, sx, sy, f.width, f.height);
        },
        (e: unknown) => console.error(`Pixi renderer: can't load ${url}`, e),
      )
      .finally(() => {
        this.loading--;
        this.requestRender();
      });
  }

  private requestRender() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private renderNow() {
    this.dirty = false;
    if (!this.ready || this.lost || !this.host.clientWidth || !this.host.clientHeight) return;
    this.app.renderer.render(this.app.stage);
    const art = this.loading ? "loading" : "ready";
    if (this.host.dataset.art !== art) this.host.dataset.art = art;
  }

  private onContextLost = () => {
    this.lost = true;
  };

  private onContextRestored = () => {
    this.lost = false;
    this.requestRender();
  };

  /** Steps the animations, renders if anything changed, and keeps going while anything animates. */
  private tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed || !this.ready) return;
    // Animations that have ended (a door left open or shut) stop asking for frames.
    let playing = false;
    for (const d of this.animated) {
      const { frame: f, nextIn } = animStep(d.pic.anim!, now - d.animStart);
      if (nextIn !== undefined) playing = true;
      if (f === d.frame) continue;
      d.frame = f;
      this.setTexture(d, d.pic.image, f);
      this.dirty = true;
    }
    // Floating sprites drift up and down, still for reduced motion.
    const bobs = this.bobbing.length > 0 && !this.reducedMotion.matches;
    for (const d of bobs ? this.bobbing : []) {
      const y = bobAt(d.pic.key, now);
      if (y === d.bobY) continue;
      d.bobY = y;
      this.place(d, { x: 0, y });
      this.dirty = true;
    }
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const turning = this.turning();
    if (turning) ({ angle: this.angle, velocity: this.spin } = stepTurn({ angle: this.angle, velocity: this.spin }, this.heading, dt, TURN));
    const streaming = this.speed !== this.cruise;
    if (this.speed !== 0 || streaming) {
      this.ramp = Math.min(1, this.ramp + dt / EASE_SECONDS);
      const eased = this.ramp * this.ramp * (3 - 2 * this.ramp);
      this.speed = this.ramp === 1 ? this.cruise : this.speedFrom + (this.cruise - this.speedFrom) * eased;
      const step = this.speed * dt;
      this.shiftSky((l) => ({ x: step * l.rate, y: (step * l.rate) / 2 }));
    }
    if (turning || this.speed !== 0 || streaming) {
      this.placeSky();
      this.dirty = true;
    }
    const streams = this.speed !== 0 || this.speed !== this.cruise || this.turning();
    const particles = this.fire.active || this.smoke.active;
    if (dt > 0 && this.fire.active) {
      this.fire.update(dt, this.reducedMotion.matches);
      this.dirty = true;
    }
    if (dt > 0 && this.smoke.active) {
      this.smoke.update(dt, this.reducedMotion.matches);
      this.dirty = true;
    }
    if (!streams && !particles) this.lastTick = 0;
    const pulse = this.pulsing && !this.reducedMotion.matches;
    if (this.esp) {
      this.esp.pulsing.alpha = espPulse(now, this.reducedMotion.matches);
      if (pulse) this.dirty = true;
    }
    if (this.dirty) this.renderNow();
    if (playing || pulse || streams || bobs || particles) this.raf = requestAnimationFrame(this.tick);
  };
}
