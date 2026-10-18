// PixiJS renderer for the iso room (#194), imperative: one Pixi Sprite per scene sprite, kept
// between scenes by key, so a scene change only touches what changed and walking only moves
// sprites. It draws the Scene it is given and nothing else: no input (the canvas ignores pointer
// events; IsoRoom hit-tests), no game state. Pixi stays inside this folder.
//
// Pixel-exact at 1x: nearest-neighbour textures, the canvas at devicePixelRatio with CSS size equal
// to the panel, rounded positions, and an integer camera. It renders on demand, not on a ticker: on
// each frame update (walking), when a texture arrives, and when an animation steps.
//
// Phase 2 draws images, flips, animations, positions and fog (as tint). Hover, selection, shadows
// and the see-through outlines are not drawn yet (phase 3).

import { Application, Container, Rectangle, Sprite, Texture, TextureStyle } from "pixi.js";
import { keyedUrl } from "../../art/keyedSprite.ts";
import { animFrame, type FrameUpdate, type Scene, type SceneAnim, type SceneImage, type SceneSprite } from "../scene.ts";

TextureStyle.defaultOptions.scaleMode = "nearest";

/** brightness() as a multiply: fogged rooms at 0.3, a lifted one at 0.5 (as in styles/iso.css). */
const TINT = { fogged: 0x4d4d4d, foggedLifted: 0x808080 } as const;

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

const animId = (a: SceneAnim | undefined) => a && `${a.frames.join(",")}/${a.frameMs}/${a.loops}`;

interface Drawn {
  sprite: Sprite;
  pic: SceneSprite;
  /** The animation frame showing, and when the animation started. */
  frame: number;
  animStart: number;
  /** The texture this sprite should show, so a late load doesn't overwrite a newer one. */
  textureKey: string;
}

export class PixiRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly drawn = new Map<string, Drawn>();
  private order: Drawn[] = [];
  private walkers: Drawn[] = [];
  private animated: Drawn[] = [];
  private scene: Scene | null = null;
  private lastFrame: FrameUpdate | null = null;
  private ready = false;
  private destroyed = false;
  private dirty = false;
  private raf = 0;
  private resize: ResizeObserver | null = null;

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
    this.app.stage.addChild(this.world);
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
    const now = performance.now();
    const next: Drawn[] = [];
    const seen = new Set<string>();
    for (const pic of scene.sprites) {
      seen.add(pic.key);
      let d = this.drawn.get(pic.key);
      if (!d) {
        d = { sprite: new Sprite(Texture.EMPTY), pic, frame: -1, animStart: now, textureKey: "" };
        this.drawn.set(pic.key, d);
      } else if (animId(d.pic.anim) !== animId(pic.anim)) {
        d.animStart = now;
      }
      d.pic = pic;
      d.frame = pic.anim ? animFrame(pic.anim, now - d.animStart) : 0;
      this.paint(d);
      this.place(d, { x: 0, y: 0 });
      next.push(d);
    }
    for (const [key, d] of this.drawn) {
      if (seen.has(key)) continue;
      d.sprite.destroy();
      this.drawn.delete(key);
    }
    // Paint order is child order; re-add only when it changed.
    if (next.length !== this.order.length || next.some((d, i) => d !== this.order[i])) {
      this.world.removeChildren();
      if (next.length) this.world.addChild(...next.map((d) => d.sprite));
    }
    this.order = next;
    this.walkers = next.filter((d) => d.pic.walker);
    this.animated = next.filter((d) => d.pic.anim);
    this.requestRender();
  }

  setFrame(frame: FrameUpdate) {
    this.lastFrame = frame;
    if (!this.ready) return;
    this.world.position.set(frame.camera.x, frame.camera.y);
    for (const d of this.walkers) this.place(d, frame.offsetOf(d.pic.walker!));
    // Drawn now, in the same frame as the DOM overlay above it, so badges and people stay together.
    this.renderNow();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    // Textures stay cached for the next renderer; only this one's sprites go.
    if (this.ready) this.app.destroy({ removeView: true }, { children: true });
  }

  /** Position and mirroring: a mirrored sprite is scaled by -1, so it is anchored on its far edge. */
  private place(d: Drawn, offset: { x: number; y: number }) {
    const { pic, sprite } = d;
    sprite.scale.set(pic.flipX ? -1 : 1, pic.flipY ? -1 : 1);
    sprite.position.set(pic.x + offset.x + (pic.flipX ? pic.width : 0), pic.y + offset.y + (pic.flipY ? pic.height : 0));
  }

  /** Texture (for the current animation frame) and tint. */
  private paint(d: Drawn) {
    const { pic, sprite } = d;
    sprite.tint = pic.effect === "fogged" || pic.effect === "foggedLifted" ? TINT[pic.effect] : 0xffffff;
    this.setTexture(d, pic.image, d.frame);
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
    void imageTexture(url, keyed).then(
      (base) => {
        if (this.destroyed || d.textureKey !== key) return;
        d.sprite.texture = frameTexture(base, key, sx, f.sy, f.width, f.height);
        this.requestRender();
      },
      (e: unknown) => console.error(`Pixi renderer: can't load ${url}`, e),
    );
  }

  private requestRender() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private renderNow() {
    this.dirty = false;
    if (this.ready && this.host.clientWidth && this.host.clientHeight) this.app.renderer.render(this.app.stage);
  }

  /** Steps the animations, renders if anything changed, and keeps going while anything animates. */
  private tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed || !this.ready) return;
    for (const d of this.animated) {
      const f = animFrame(d.pic.anim!, now - d.animStart);
      if (f === d.frame) continue;
      d.frame = f;
      this.setTexture(d, d.pic.image, f);
      this.dirty = true;
    }
    if (this.dirty) this.renderNow();
    if (this.animated.length) this.raf = requestAnimationFrame(this.tick);
  };
}
