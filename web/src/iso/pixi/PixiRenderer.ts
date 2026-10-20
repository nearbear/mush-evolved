// PixiJS renderer for the iso room (#194), imperative: one Pixi Sprite per scene sprite, kept
// between scenes by key, so a scene change only touches what changed and walking only moves
// sprites. It draws the Scene it is given and nothing else: no input (the canvas ignores pointer
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
// covers its person. The pulse of those outlines keeps it rendering every frame while one shows.
//
// WebGL context loss (a phone backgrounding the tab, a GPU reset): Pixi keeps the context restorable
// and rebuilds its textures and programs when it comes back. This only stops drawing while it is lost
// and draws once it is back, since nothing else would ask for a frame.

import { Application, Container, type Filter, Rectangle, RendererType, Sprite, Texture, TextureStyle } from "pixi.js";
import { keyedUrl } from "../../art/keyedSprite.ts";
import { animId, animStep, type FrameUpdate, type Scene, type SceneImage, type SceneOutline, type ScenePicture, type SceneSprite } from "../scene.ts";
import { ESP, espPulse, filterKey, lookOf } from "./effects.ts";
import { EspFilters, lookFilter } from "./filters.ts";

TextureStyle.defaultOptions.scaleMode = "nearest";

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

interface Drawn {
  sprite: Sprite;
  pic: ScenePicture;
  /** The animation frame showing, and when the animation started. */
  frame: number;
  animStart: number;
  /** The texture this sprite should show, so a late load doesn't overwrite a newer one. */
  textureKey: string;
}

/** Outlines are kept in the same map as sprites, under their own keys. */
const OUTLINE = "esp|";

export class PixiRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly sprites = new Container();
  private readonly outlines = new Container();
  private readonly drawn = new Map<string, Drawn>();
  private order: Drawn[] = [];
  private outlineOrder: Drawn[] = [];
  private walkers: Drawn[] = [];
  private animated: Drawn[] = [];
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
  /** Filters by look (filterKey), and the outlines' two, made once the renderer is up. */
  private readonly looks = new Map<string, Filter>();
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
    this.world.addChild(this.sprites, this.outlines);
    this.app.stage.addChild(this.world);
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
    this.renderNow();
  }

  setScene(scene: Scene) {
    this.scene = scene;
    if (!this.ready) return;
    const seen = new Set<string>();
    const sprites = this.sync(scene.sprites, "", this.sprites, this.order, seen, (d, s) => this.paintSprite(d, s));
    const outlines = this.sync(scene.outlines, OUTLINE, this.outlines, this.outlineOrder, seen, (d, o) => this.paintOutline(d, o));
    for (const [key, d] of this.drawn) {
      if (seen.has(key)) continue;
      d.sprite.destroy();
      this.drawn.delete(key);
    }
    this.order = sprites;
    this.outlineOrder = outlines;
    const all = [...sprites, ...outlines];
    this.walkers = all.filter((d) => d.pic.walker);
    this.animated = all.filter((d) => d.pic.anim);
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
      next.push(d);
    }
    // Paint order is child order; re-add only when it changed.
    if (next.length !== prev.length || next.some((d, i) => d !== prev[i])) {
      layer.removeChildren();
      if (next.length) layer.addChild(...next.map((d) => d.sprite));
    }
    return next;
  }

  setFrame(frame: FrameUpdate) {
    this.lastFrame = frame;
    if (!this.ready) return;
    const { camera } = frame;
    const x = Math.round(camera.x);
    const y = Math.round(camera.y);
    this.world.position.set(x, y);
    // Each walker is rounded where it lands on screen, not in the world: your own walker cancels the
    // camera's fraction exactly, so you stay still on screen while the room moves under you.
    for (const d of this.walkers) {
      const o = frame.offsetOf(d.pic.walker!);
      this.place(d, { x: Math.round(o.x + camera.x) - x, y: Math.round(o.y + camera.y) - y });
    }
    // Drawn now, in the same frame as the DOM overlay above it, so badges and people stay together.
    this.renderNow();
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
    this.esp?.pulsing.destroy();
    this.esp?.faint.destroy();
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
    if (d.sprite.filters?.[0] !== filter) d.sprite.filters = filter ? [filter] : [];
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
    const sx = f.sx + frame * f.width;
    const key = `${keyed ? "k" : ""}|${url}|${sx},${f.sy},${f.width},${f.height}`;
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
          d.sprite.texture = frameTexture(base, key, sx, f.sy, f.width, f.height);
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
    const pulse = this.pulsing && !this.reducedMotion.matches;
    if (this.esp) {
      this.esp.pulsing.alpha = espPulse(now, this.reducedMotion.matches);
      if (pulse) this.dirty = true;
    }
    if (this.dirty) this.renderNow();
    if (playing || pulse) this.raf = requestAnimationFrame(this.tick);
  };
}
