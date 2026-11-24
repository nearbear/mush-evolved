// PixiJS renderer for the iso room (#194), imperative: one Pixi Sprite per scene sprite, kept
// between scenes by key, so a scene change only touches what changed and walking only moves
// sprites. It draws the Scene it is given over a star field (starfield.ts) and nothing else: no input (the canvas ignores pointer
// events; IsoRoom hit-tests), no game state. Pixi stays inside this folder.
//
// Pixel-exact at 1x: nearest-neighbour textures, the canvas at an integer resolution (rounded
// devicePixelRatio, so fractional DPI like 125% doesn't misalign filter render targets) with CSS size equal
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
// On desktop the canvas lives in the screen-wide backdrop (iso/backdrop.ts) instead of the panel, so the star field
// fills the viewport: the room is drawn at the panel's place on it, clipped to the panel, with the camera it always had.
// The panel's zoom (a CSS scale on the host) is then the world's scale, and the stars stay at 1x.
//
// WebGL context loss (a phone backgrounding the tab, a GPU reset): Pixi keeps the context restorable
// and rebuilds its textures and programs when it comes back. This only stops drawing while it is lost
// and draws once it is back, since nothing else would ask for a frame.

import { Application, Container, type Filter, Graphics, Rectangle, RendererType, Sprite, Texture, TextureStyle, TilingSprite, UniformGroup } from "pixi.js";
// Pixi's shader code without `new Function`, which the CSP forbids (web/public/_headers).
import "pixi.js/unsafe-eval";
import { FX_SHEET } from "../../art/assets.ts";
import { keyedUrl } from "../../art/keyedSprite.ts";
import { animId, animStep, type Cutaway, FADE_MS, frameAt, PACE_SPEED, type FrameUpdate, type Scene, type SceneImage, type SceneOutline, type ScenePicture, type SceneSprite, type ShipTurn } from "../scene.ts";
import { orbitField, type OrbitField, orbitSearchCorners, shiftTile, stepOrbitStar, stepTurn, tilePosition, type TurnLimits } from "../skyTurn.ts";
import { gridToPx } from "../placement.ts";
import { ftlStarfield, ftlStarLayer, STAR_REACH, starfield, starLayer, starPoints, type StarPoint, starStamp } from "../starfield.ts";
import { CELLS_PER_SECOND } from "../useWalkers.ts";
import { ESP, espPulse, filterKey, lookOf, selectionPulse } from "./effects.ts";
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
/**
 * How fast each layer streams past at cruising pace (pixels a second, along x; they run down-right, upper left to bottom right, at the iso grid's 2:1 slope), and how long a change of speed takes to ease in and out (seconds).
 * Each is 1.5 times what the camera's parallax moves that layer while you walk up-left (against the stream), so walking against it slows the stars but never stops or reverses them.
 */
const WALK_PX = CELLS_PER_SECOND * gridToPx(1, 0).x;
const SKY_DRIFT = 1.5 * SKY_PARALLAX * WALK_PX;
const STARS_DRIFT = 1.5 * STARS_PARALLAX * WALK_PX;
const EASE_SECONDS = 3;
/**
 * When the ship turns a quarter, the stars turn a quarter the other way: speeding up to at most `speed` (radians a
 * second) and slowing to a stop at `accel` (radians a second, each second), so a quarter turn takes about 9.5 s.
 */
const TURN: TurnLimits = { speed: 0.24, accel: 0.08 };
/**
 * In orbit the near stars glide slowly counterclockwise along 2D bipolar elliptical streamlines (`skyTurn.ts`) while
 * the nebula stays undistorted. Signed speed along the equator as a multiple of `STARS_DRIFT` (negative = counterclockwise).
 */
const ORBIT_STARS_SPEED = -0.1;
let skyTexture: Texture | null = null;
let starsTexture: Texture | null = null;
let ftlSkyTexture: Texture | null = null;
let ftlStarsTexture: Texture | null = null;

function imageToTexture({ size, rgba }: { size: number; rgba: Uint8ClampedArray<ArrayBuffer> }): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, size, size), 0, 0);
  return Texture.from(canvas);
}

/** The star field behind the ship, made once (about 0.1 s) and repeated across the panel. */
function sky(): Texture {
  return (skyTexture ??= imageToTexture(starfield(SKY_SIZE)));
}

/** The near stars over the sky, made once. */
function stars(): Texture {
  return (starsTexture ??= imageToTexture(starLayer(STARS_SIZE)));
}

/** Faster-than-light sky and near streaks (#480), made lazily once the ship launches. */
function ftlSky(): Texture {
  return (ftlSkyTexture ??= imageToTexture(ftlStarfield(SKY_SIZE)));
}

function ftlStars(): Texture {
  return (ftlStarsTexture ??= imageToTexture(ftlStarLayer(STARS_SIZE)));
}

/** The near stars one by one (`starLayer`'s), and one small texture per kind of star, for the orbit. */
let nearPoints: StarPoint[] | null = null;
const stampTextures = new Map<StarPoint["kind"], Texture>();
function stamp(kind: StarPoint["kind"]): Texture {
  let t = stampTextures.get(kind);
  if (!t) stampTextures.set(kind, (t = imageToTexture(starStamp(kind))));
  return t;
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
  /** An outlined sprite's effect (`SceneSprite.outline`): a copy of it clipped to the outline, drawn just after it. */
  focus?: Focus;
  /** A fade under way (`SceneSprite.fade`): which way, and when it started. A fade in is dropped once done. */
  fade?: { dir: "in" | "out"; start: number };
}

/** How opaque a fading sprite is at `now`: 0 to 1 over `FADE_MS` coming in, 1 to 0 going out. */
function fadeAlpha(fade: { dir: "in" | "out"; start: number } | undefined, now: number): number {
  if (!fade) return 1;
  const t = Math.min(1, Math.max(0, (now - fade.start) / FADE_MS));
  return fade.dir === "in" ? t : 1 - t;
}

/**
 * The copy that carries an outlined sprite's effect. The mask clips the copy to the outline and the filter sits on
 * the box around it, so a glow wraps the outlined part rather than being cut off at its edge.
 */
interface Focus {
  box: Container;
  sprite: Sprite;
  mask: Graphics;
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

/** A sprite and, after it, its focus copy if it has one. */
const withFocus = (d: Drawn): Container[] => (d.focus ? [d.sprite, d.focus.box] : [d.sprite]);

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
  /**
   * The orbit streamlines (skyTurn.ts): `orbitBlend` eases smoothly between 0 (flat cruising tile) and 1 (two-pole 2D
   * elliptical streamlines) over `EASE_SECONDS`. Stars are seeded from `sky[1]`'s exact screen positions on entry so
   * entering orbit never pops, and cross-fade back when leaving.
   */
  private orbiting = false;
  private orbitBlend = 0;
  private orbitFrom = 0;
  private orbitRamp = 1;
  private orbitPool: { x: number; y: number; kind: StarPoint["kind"]; color: number }[] = [];
  private orbitSize = { width: 0, height: 0 };
  /** In orbit the near stars are drawn one by one along their elliptical streamlines, keeping their pixel shape; a pool of sprites. */
  private readonly orbitStars = new Container();
  private orbitSprites: Sprite[] = [];
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
  /** Whether the ship is in intergalactic FTL travel (#480): uses streaked textures aligned with the 2:1 stream. */
  private ftl = false;
  private lastTick = 0;
  private camera = { x: 0, y: 0 };
  /** Where the room panel is on the canvas (all of it without a backdrop), and its zoom (1 without a backdrop: CSS scales the canvas). */
  private panel = { x: 0, y: 0, width: 0, height: 0 };
  private zoom = 1;
  /** With a backdrop: the panel's rectangle, which the world is clipped to. */
  private clip: Graphics | null = null;
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
  private fading: Drawn[] = [];
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
  /** Where the world's origin is on the canvas, and its scale (the panel's zoom), for the cutaway filter. */
  private readonly cameraUniforms = new UniformGroup({
    uCamera: { value: new Float32Array([0, 0]), type: "vec2<f32>" },
    uZoom: { value: 1, type: "f32" },
  });
  private esp: { pulsing: EspFilters; faint: EspFilters } | null = null;
  /** Whether any outline that pulses is showing, which keeps frames coming. */
  private pulsing = false;
  /** The selection glow's opacity, shared by every pulsing look filter (lookFilter). */
  private readonly selectionUniforms = new UniformGroup({ uGlowAlpha: { value: 1, type: "f32" } });
  /** Whether a selected sprite is showing, which keeps frames coming for its pulse. */
  private selecting = false;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /** Where the canvas goes and what it fills: the backdrop if there is one, else the panel (`host`). */
  private readonly surface: HTMLElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly backdrop: HTMLElement | null = null,
  ) {
    this.surface = backdrop ?? host;
    this.init().catch((e: unknown) => console.error("Pixi renderer failed to start", e));
  }

  private async init() {
    await this.app.init({
      width: Math.max(1, this.surface.clientWidth),
      height: Math.max(1, this.surface.clientHeight),
      backgroundAlpha: 0,
      antialias: false,
      resolution: Math.max(1, Math.round(window.devicePixelRatio || 1)),
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
    this.orbitStars.visible = false;
    this.app.stage.addChild(...this.sky.map((l) => l.sprite), this.orbitStars, this.planet, this.world);
    if (this.backdrop) {
      this.clip = new Graphics();
      this.app.stage.addChild(this.clip);
      this.world.mask = this.clip;
    }
    // The shaders are GLSL; on anything but WebGL the sprites are drawn without effects.
    if (this.app.renderer.type === RendererType.WEBGL) {
      const rim = this.color("--glow-rim");
      const resolution = this.app.renderer.resolution;
      this.esp = { pulsing: new EspFilters(rim, 1, resolution), faint: new EspFilters(rim, ESP.faint, resolution) };
    }
    this.app.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.app.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.surface.appendChild(this.app.canvas);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.host);
    if (this.backdrop) this.resize.observe(this.backdrop);
    this.ready = true;
    if (this.scene) this.setScene(this.scene);
    if (this.lastFrame) this.setFrame(this.lastFrame);
    this.fit();
  }

  /**
   * Match the canvas to what it fills (the panel, or the backdrop), and find the panel on it. A panel hidden with CSS
   * (phone tabs) measures 0: leave it be.
   */
  private fit() {
    const { clientWidth: w, clientHeight: h } = this.surface;
    if (!this.ready || !w || !h || !this.host.clientWidth || !this.host.clientHeight) return;
    if (this.app.renderer.width !== w || this.app.renderer.height !== h) this.app.renderer.resize(w, h);
    for (const l of this.sky) l.sprite.setSize(w, h);
    if (this.backdrop) {
      const at = this.host.getBoundingClientRect();
      const on = this.backdrop.getBoundingClientRect();
      this.panel = { x: Math.round(at.left - on.left), y: Math.round(at.top - on.top), width: Math.round(at.width), height: Math.round(at.height) };
      this.zoom = at.width / this.host.clientWidth;
      this.clip?.clear().rect(this.panel.x, this.panel.y, this.panel.width, this.panel.height).fill(0xffffff);
    } else {
      this.panel = { x: 0, y: 0, width: w, height: h };
    }
    this.placeWorld();
    this.placeSky();
    this.placePlanet();
    this.renderNow();
  }

  /** Puts the world's origin where the camera says, in the panel, at the panel's zoom. */
  private placeWorld() {
    const x = this.panel.x + this.zoom * Math.round(this.camera.x);
    const y = this.panel.y + this.zoom * Math.round(this.camera.y);
    this.world.position.set(x, y);
    this.world.scale.set(this.zoom);
    const cam = this.cameraUniforms.uniforms.uCamera as Float32Array;
    cam[0] = x;
    cam[1] = y;
    this.cameraUniforms.uniforms.uZoom = this.zoom;
  }

  setScene(scene: Scene) {
    this.scene = scene;
    if (!this.ready) return;
    const ftl = scene.pace === "ftl";
    if (ftl !== this.ftl) {
      this.ftl = ftl;
      this.orbitBlend = 0;
      this.orbitFrom = 0;
      this.orbitRamp = 1;
      this.sky[0]!.sprite.texture = ftl ? ftlSky() : sky();
      this.sky[1]!.sprite.texture = ftl ? ftlStars() : stars();
      this.placeSky();
    }
    const cruise = this.reducedMotion.matches ? 0 : PACE_SPEED[scene.pace];
    const orbiting = scene.pace === "orbiting" && !this.reducedMotion.matches;
    if (!this.paceSeen) {
      this.paceSeen = true;
      this.speed = cruise;
      this.orbitBlend = orbiting ? 1 : 0;
      this.orbitFrom = this.orbitBlend;
      this.orbitRamp = 1;
    } else {
      if (cruise !== this.cruise) {
        this.speedFrom = this.speed;
        this.ramp = 0;
      }
      if (orbiting !== this.orbiting) {
        this.orbitFrom = this.orbitBlend;
        this.orbitRamp = 0;
      }
    }
    this.cruise = cruise;
    this.orbiting = orbiting;
    if (this.reducedMotion.matches && this.orbitBlend !== 0) {
      this.orbitBlend = 0;
      this.orbitFrom = 0;
      this.orbitRamp = 1;
      this.placeSky();
    }
    if (this.speed !== this.cruise || this.orbiting || this.orbitBlend !== 0) this.requestRender();
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
      d.focus?.box.destroy({ children: true });
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
    this.fading = sprites.filter((d) => d.fade);
    this.pulsing = scene.outlines.some((o) => o.occluded && !o.faint);
    this.selecting = scene.sprites.some((s) => s.effect === "selected");
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
      const fade = (pic as ScenePicture & Pick<SceneSprite, "fade">).fade;
      if (!d) {
        d = { sprite: new Sprite(Texture.EMPTY), pic, frame: -1, animStart: now, textureKey: "", ...(fade === "in" && { fade: { dir: "in" as const, start: now } }) };
        this.drawn.set(key, d);
      } else if (animId(d.pic.anim) !== animId(pic.anim)) {
        d.animStart = now;
      }
      d.pic = pic;
      // A fade in only starts with the sprite and then runs its course; a fade out starts when asked and holds.
      if (fade === "out" && d.fade?.dir !== "out") d.fade = { dir: "out", start: now };
      else if (fade !== "out" && d.fade?.dir === "out") delete d.fade;
      d.frame = pic.anim ? animStep(pic.anim, now - d.animStart).frame : 0;
      paint(d, pic);
      this.setAlpha(d, fadeAlpha(d.fade, now));
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
    if (!scene.fire.length && !scene.smoke.length) return sprites.flatMap(withFocus);
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
      out.push(...(before.get(i) ?? []), ...withFocus(d));
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
    if (!this.reducedMotion.matches) {
      const dx = camera.x - this.camera.x;
      const dy = camera.y - this.camera.y;
      this.shiftSky((l) => ({ x: dx * l.parallax, y: dy * l.parallax }));
      if (this.orbitPool.length) {
        const ox = dx * STARS_PARALLAX;
        const oy = dy * STARS_PARALLAX;
        for (const p of this.orbitPool) {
          p.x += ox;
          p.y += oy;
        }
      }
    }
    this.camera = camera;
    this.placeWorld();
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
    const { x, y, width, height } = this.panel;
    this.planet.position.set(Math.round(x + width - this.planet.texture.width), Math.round(y + height - this.planet.texture.height));
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

  /** Active sky rotation: 0 in FTL so the 2:1 streaks always line up with the down-right stream (#480). */
  private skyAngle() {
    return this.ftl ? 0 : this.angle;
  }

  /** Whether the stars are still turning toward `heading`. */
  private turning() {
    return !this.ftl && (this.angle !== this.heading || this.spin !== 0);
  }

  /** Moves each layer by `by(layer, index)` on screen: turned back into the tile's frame, so it moves that way whatever the turn. */
  private shiftSky(by: (l: SkyLayer, i: number) => { x: number; y: number }) {
    const angle = this.skyAngle();
    this.sky.forEach((l, i) => {
      l.at = shiftTile(l.at, by(l, i), angle, l.size);
    });
  }

  /**
   * The layers follow the camera slower than the ship, stream down-right at the ship's speed, and are turned by
   * `angle` about the panel's centre. In orbit (`orbitBlend > 0`), the nebula stays undistorted while the near stars
   * glide counterclockwise along two-pole 2D elliptical streamlines (`skyTurn.ts`).
   */
  private placeSky() {
    const angle = this.skyAngle();
    const center = { x: this.panel.x + this.panel.width / 2, y: this.panel.y + this.panel.height / 2 };
    const whole = this.turning() ? (v: number) => v : Math.round;
    for (const l of this.sky) {
      const p = tilePosition(l.at, angle, center);
      l.sprite.tilePosition.set(whole(p.x), whole(p.y));
      l.sprite.tileRotation = angle;
    }
    const curved = !this.ftl && this.orbitBlend > 0;
    if (!curved) {
      this.orbitPool = [];
      this.sky[1]!.sprite.visible = true;
      this.sky[1]!.sprite.alpha = 1;
      this.orbitStars.visible = false;
      return;
    }
    const { width, height } = this.app.screen;
    const field = orbitField(this.app.screen);
    if (!this.orbitPool.length || this.orbitSize.width !== width || this.orbitSize.height !== height) {
      this.seedOrbitPool(angle, center, this.sky[1]!, field);
    }
    // Entering/in orbit, `orbitPool` was seeded from `sky[1]`'s exact pixels (zero pop); leaving, cross-fade back.
    const leaving = !this.orbiting;
    this.sky[1]!.sprite.visible = leaving;
    this.sky[1]!.sprite.alpha = leaving ? 1 - this.orbitBlend : 1;
    this.orbitStars.visible = true;
    this.orbitStars.alpha = leaving ? this.orbitBlend : 1;
    this.placeOrbitStars();
  }

  /** Snapshots `sky[1]`'s near stars in screen space so entering orbit continues from the exact current star pixels. */
  private seedOrbitPool(angle: number, center: { x: number; y: number }, layer: SkyLayer, field: OrbitField) {
    const points = (nearPoints ??= starPoints(STARS_SIZE));
    const o = tilePosition(layer.at, angle, center);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of orbitSearchCorners(field)) {
      const dx = c.x - o.x;
      const dy = c.y - o.y;
      const ux = cos * dx + sin * dy;
      const uy = -sin * dx + cos * dy;
      minX = Math.min(minX, ux);
      maxX = Math.max(maxX, ux);
      minY = Math.min(minY, uy);
      maxY = Math.max(maxY, uy);
    }
    const size = layer.size;
    const pool: { x: number; y: number; kind: StarPoint["kind"]; color: number }[] = [];
    for (let ky = Math.floor(minY / size); ky <= Math.floor(maxY / size); ky++) {
      for (let kx = Math.floor(minX / size); kx <= Math.floor(maxX / size); kx++) {
        const ox = kx * size;
        const oy = ky * size;
        for (const p of points) {
          const tx = ox + p.x;
          const ty = oy + p.y;
          pool.push({
            x: o.x + cos * tx - sin * ty,
            y: o.y + sin * tx + cos * ty,
            kind: p.kind,
            color: p.color,
          });
        }
      }
    }
    this.orbitPool = pool;
    this.orbitSize = { width: this.app.screen.width, height: this.app.screen.height };
  }

  /** Draws the visible stars of `orbitPool` one by one in whole pixels, reusing the sprite pool. */
  private placeOrbitStars() {
    const { width, height } = this.app.screen;
    const reach = 4;
    let used = 0;
    for (const p of this.orbitPool) {
      const sx = Math.round(p.x);
      const sy = Math.round(p.y);
      if (sx < -reach || sy < -reach || sx > width + reach || sy > height + reach) continue;
      let sprite = this.orbitSprites[used];
      if (!sprite) {
        sprite = new Sprite(Texture.EMPTY);
        this.orbitSprites.push(sprite);
        this.orbitStars.addChild(sprite);
      }
      used++;
      const r = Math.max(STAR_REACH[p.kind].x, STAR_REACH[p.kind].y);
      sprite.texture = stamp(p.kind);
      sprite.tint = p.kind === "dot" ? p.color : 0xffffff;
      sprite.position.set(sx - r, sy - r);
      sprite.visible = true;
    }
    for (let i = used; i < this.orbitSprites.length; i++) this.orbitSprites[i]!.visible = false;
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
  /** A sprite's opacity, its effect's copy included. */
  private setAlpha(d: Drawn, alpha: number) {
    d.sprite.alpha = alpha;
    if (d.focus) d.focus.box.alpha = alpha;
  }

  private paintSprite(d: Drawn, s: SceneSprite) {
    const look = lookOf(s);
    d.sprite.tint = look.tint;
    const key = this.esp ? filterKey(look) : "";
    let filter = key ? this.looks.get(key) : undefined;
    if (key && !filter) {
      filter = lookFilter(look, (token) => this.color(token), this.app.renderer.resolution, this.selectionUniforms);
      this.looks.set(key, filter);
    }
    // An outlined sprite is drawn plain, with its effect on a copy clipped to the outline.
    const focused = filter && s.outline;
    this.setFocus(d, focused ? s.outline : undefined, filter);
    const next: Filter[] = [];
    if (filter && !focused) next.push(filter);
    if (s.cutaway && this.esp) next.push(this.getCutawayFilter(s.cutaway));
    const cur = d.sprite.filters ?? [];
    if (cur.length !== next.length || cur.some((f, i) => f !== next[i])) {
      d.sprite.filters = next;
    }
  }

  /** Makes, redraws or drops the sprite's focus copy (`Drawn.focus`); `copyFocus` keeps it on the sprite. */
  private setFocus(d: Drawn, outline: SceneSprite["outline"], filter: Filter | undefined) {
    if (!outline || !filter) {
      d.focus?.box.destroy({ children: true });
      d.focus = undefined;
      return;
    }
    if (!d.focus) {
      const box = new Container();
      const sprite = new Sprite(Texture.EMPTY);
      const mask = new Graphics();
      box.addChild(sprite, mask);
      sprite.mask = mask;
      d.focus = { box, sprite, mask };
    }
    const { box, mask } = d.focus;
    mask.clear().poly(outline.flat()).fill(0xffffff);
    if (box.filters?.[0] !== filter) box.filters = [filter];
  }

  /** The focus copy follows its sprite: frame, position, mirroring and fog. Run before each render. */
  private copyFocus() {
    for (const d of this.order) {
      const f = d.focus;
      if (!f) continue;
      f.sprite.texture = d.sprite.texture;
      f.sprite.tint = d.sprite.tint;
      for (const part of [f.sprite, f.mask]) {
        part.position.copyFrom(d.sprite.position);
        part.scale.copyFrom(d.sprite.scale);
      }
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
    this.copyFocus();
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
    // Fades step every frame until done; a fade out then holds at nothing until the scene drops the sprite.
    let fades = false;
    for (const d of this.fading) {
      if (!d.fade) continue;
      const alpha = fadeAlpha(d.fade, now);
      if (now - d.fade.start < FADE_MS) fades = true;
      else if (d.fade.dir === "in") delete d.fade;
      if (alpha === d.sprite.alpha) continue;
      this.setAlpha(d, alpha);
      this.dirty = true;
    }
    if (!fades) this.fading = this.fading.filter((d) => d.fade);
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const turning = this.turning();
    if (turning) ({ angle: this.angle, velocity: this.spin } = stepTurn({ angle: this.angle, velocity: this.spin }, this.heading, dt, TURN));
    const orbitTarget = !this.ftl && this.orbiting ? 1 : 0;
    const orbitingAnim = this.orbitBlend !== orbitTarget;
    if (orbitingAnim) {
      this.orbitRamp = Math.min(1, this.orbitRamp + dt / EASE_SECONDS);
      const eased = this.orbitRamp * this.orbitRamp * (3 - 2 * this.orbitRamp);
      this.orbitBlend = this.orbitRamp === 1 ? orbitTarget : this.orbitFrom + (orbitTarget - this.orbitFrom) * eased;
    }
    const streaming = this.speed !== this.cruise;
    if (this.speed !== 0 || streaming) {
      this.ramp = Math.min(1, this.ramp + dt / EASE_SECONDS);
      const eased = this.ramp * this.ramp * (3 - 2 * this.ramp);
      this.speed = this.ramp === 1 ? this.cruise : this.speedFrom + (this.cruise - this.speedFrom) * eased;
      const step = this.speed * dt;
      this.shiftSky((l) => ({ x: step * l.rate, y: (step * l.rate) / 2 }));
    }
    const orbitDrift = !this.ftl && this.orbitBlend > 0;
    if (orbitDrift && dt > 0 && this.orbitPool.length) {
      const field = orbitField(this.app.screen);
      const dist = ORBIT_STARS_SPEED * this.orbitBlend * STARS_DRIFT * dt;
      for (const p of this.orbitPool) {
        const next = stepOrbitStar(p, field, dist);
        p.x = next.x;
        p.y = next.y;
      }
    }
    if (turning || orbitingAnim || this.speed !== 0 || streaming || orbitDrift) {
      this.placeSky();
      this.dirty = true;
    }
    const streams = this.speed !== 0 || this.speed !== this.cruise || this.turning() || this.orbitBlend !== orbitTarget || (!this.ftl && this.orbitBlend > 0);
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
    // The selection's pulse, in 1/20 steps: frames keep coming, but the scene redraws about 17 times a second, not 60.
    const selecting = this.selecting && !this.reducedMotion.matches;
    const glow = selecting ? Math.round(selectionPulse(now, false) * 20) / 20 : 1;
    if (this.selectionUniforms.uniforms.uGlowAlpha !== glow) {
      this.selectionUniforms.uniforms.uGlowAlpha = glow;
      this.dirty = true;
    }
    if (this.dirty) this.renderNow();
    if (playing || pulse || selecting || streams || bobs || particles || fades) this.raf = requestAnimationFrame(this.tick);
  };
}
