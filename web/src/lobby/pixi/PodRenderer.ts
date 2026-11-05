// PixiJS backdrop for the lobby: the cryopod's lid, bent into a half-cylinder. Replaces the CSS version,
// which drew the whole pod about 80 times (one tilted strip each) and was too slow on weaker devices.
//
// The pod is drawn flat once per size with Canvas 2D (podArt.ts) into two layers, behind and in front
// of the vent's fan. Those, the spinning fan and the pulsing stasis light are composed into one flat
// render texture, and a single full-canvas quad bends it onto the cylinder in its fragment shader
// (the inverse of the perspective projection, `unroll` in podGeometry.ts; change both). Only the
// part of the flat texture around the fan and the light is redrawn each frame, at most 30 a second.
//
// It survives a lost WebGL context (stops drawing; redraws all of it when the context is back) and a
// StrictMode remount (a renderer destroyed before it started cleans up after itself).

import { Application, CanvasSource, Container, Geometry, GlProgram, Mesh, Rectangle, RenderTexture, Shader, Sprite, Texture, UniformGroup } from "pixi.js";
import { bakePod, loadFrost, type PodArt } from "../podArt.ts";
import { bakeScale, cylinder, DARK, fanAngle, flatBounds, flatRectAt, LIGHT, podLayout, type Rect, stasisAlpha } from "../podGeometry.ts";

/** Keep in sync with MOBILE_QUERY in useMobile.ts: the phone layout has a thinner bezel. */
const MOBILE_QUERY = "(max-width: 1023px)";
const FRAME_MS = 1000 / 30;
/** Within every WebGL2 device's limit. */
const MAX_TEXTURE = 4096;

const vertex = `#version 300 es
in vec2 aPosition;
out vec2 vPos;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main(void) {
  vec3 at = uTransformMatrix * vec3(aPosition, 1.0);
  vPos = at.xy;
  gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * at).xy, 0.0, 1.0);
}
`;

// For each canvas pixel, the flat point the cylinder shows there (podGeometry's `unroll`), lit by the
// light from the left, or the darkness past the wall.
const fragment = `#version 300 es
precision highp float;
in vec2 vPos;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uCentre;   // the window's centre, in canvas pixels
uniform vec2 uWindow;   // the window's size
uniform vec3 uCylinder; // radius, perspective distance, the wall's edge angle
uniform vec4 uFlat;     // the flat texture's area, from the window's top-left corner
uniform float uLight;
uniform vec3 uDark;

void main(void) {
  vec2 d = vPos - uCentre;
  float r = uCylinder.x;
  float p = uCylinder.y;
  float a = p * r;
  float b = d.x * r;
  float k = d.x * (p - r) / length(vec2(a, b));
  finalColor = vec4(uDark, 1.0);
  if (abs(k) > 1.0) return;
  float phi = atan(b, a) + asin(k);
  if (abs(phi) > uCylinder.z) return;
  float s = r * phi;
  vec2 at = vec2(s + 0.5 * uWindow.x, d.y * (p - r * (1.0 - cos(phi))) / p + 0.5 * uWindow.y);
  vec2 uv = (at - uFlat.xy) / uFlat.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return;
  vec3 c = texture(uTexture, uv).rgb;
  finalColor = vec4(min(c * (1.0 + uLight * s / uWindow.x), vec3(1.0)), 1.0);
}
`;

const darkRgb = (): Float32Array => {
  const n = Number.parseInt(DARK.slice(1), 16);
  return new Float32Array([(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
};

const canvasTexture = (canvas: HTMLCanvasElement, scaleMode: "linear" | "nearest") =>
  new Texture({ source: new CanvasSource({ resource: canvas, scaleMode }) });

/** Everything made from one bake; replaced whole on a resize. */
interface Baked {
  textures: Texture[];
  flat: RenderTexture;
  /** The whole flat drawing, and just the part that animates. Each has its own fan and light. */
  full: Container;
  patch: Container;
  fans: Sprite[];
  lights: Sprite[];
}

function drop(b: Baked) {
  b.full.destroy({ children: true });
  b.patch.destroy({ children: true });
  // The patch textures share their sources with the whole ones, destroyed with those.
  for (const t of b.textures.slice(4)) t.destroy(false);
  for (const t of b.textures.slice(0, 4)) t.destroy(true);
  b.flat.destroy(true);
}

export class PodRenderer {
  private readonly app = new Application();
  private readonly uniforms = new UniformGroup({
    uCentre: { value: new Float32Array(2), type: "vec2<f32>" },
    uWindow: { value: new Float32Array(2), type: "vec2<f32>" },
    uCylinder: { value: new Float32Array(3), type: "vec3<f32>" },
    uFlat: { value: new Float32Array(4), type: "vec4<f32>" },
    uLight: { value: LIGHT, type: "f32" },
    uDark: { value: darkRgb(), type: "vec3<f32>" },
  });
  private mesh: Mesh<Geometry, Shader> | null = null;
  private baked: Baked | null = null;
  private frost: HTMLImageElement[] | null = null;
  private ready = false;
  private destroyed = false;
  private lost = false;
  /** The whole flat texture needs drawing (a new bake, a restored context), not just the patch. */
  private stale = true;
  private needsBake = false;
  /** The sizes the current bake was made for. */
  private bakedFor = "";
  private raf = 0;
  private lastDraw = -Infinity;
  private resize: ResizeObserver | null = null;
  private readonly mobile = window.matchMedia(MOBILE_QUERY);
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /**
   * `host` is filled with the canvas; `pod` is the window the panel sits in, which places the pod;
   * `sticker` is the empty box in the page's footer the maker's sticker is drawn over (hidden on phones).
   */
  constructor(
    private readonly host: HTMLElement,
    private readonly pod: HTMLElement,
    private readonly sticker: HTMLElement | null,
  ) {
    this.init().catch((e: unknown) => console.error("Lobby backdrop failed to start", e));
  }

  private async init() {
    const [frost] = await Promise.all([
      loadFrost(),
      this.app.init({
        width: Math.max(1, this.host.clientWidth),
        height: Math.max(1, this.host.clientHeight),
        background: DARK,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        autoStart: false,
        preference: "webgl",
      }),
    ]);
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.frost = frost;
    this.app.stage.eventMode = "none";
    this.app.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.app.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.host.appendChild(this.app.canvas);
    // Fires once on observing, too: that first call makes the first bake.
    this.resize = new ResizeObserver(() => {
      this.needsBake = true;
      this.request();
    });
    this.resize.observe(this.host);
    this.resize.observe(this.pod);
    this.ready = true;
  }

  /** Measures the window and, if anything moved, redraws the flat pod for it and sets up the bend. */
  private bake() {
    this.needsBake = false;
    if (!this.frost) return;
    const hostBox = this.host.getBoundingClientRect();
    const box = this.pod.getBoundingClientRect();
    if (!hostBox.width || !hostBox.height || !box.width || !box.height) return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const slot = this.sticker?.getBoundingClientRect();
    const slotAt = slot?.width ? [slot.left - box.left, slot.top - box.top, slot.width, slot.height] : [];
    const key = [hostBox.width, hostBox.height, box.left - hostBox.left, box.top - hostBox.top, box.width, box.height, rem, this.mobile.matches, window.devicePixelRatio, window.innerHeight, ...slotAt].join();
    if (key === this.bakedFor) return;
    this.bakedFor = key;
    const c = cylinder(box.width, box.height);
    // The sticker goes on the wall where the footer left its box, unrolled so the bend puts it back there.
    const sticker =
      slot?.width && slot.height
        ? flatRectAt(c, slot.left + slot.width / 2 - (box.left + box.width / 2), slot.top + slot.height / 2 - (box.top + box.height / 2), slot.width, slot.height)
        : null;
    const layout = podLayout(box.width, box.height, rem, this.mobile.matches, sticker);
    const bounds = flatBounds(layout, c, hostBox.top - box.top, hostBox.bottom - box.top);
    const scale = bakeScale(bounds, window.devicePixelRatio || 1, MAX_TEXTURE);
    const art = bakePod({ layout, bounds, scale, rem, viewportHeight: window.innerHeight, frost: this.frost });

    const old = this.baked;
    this.baked = this.compose(art, bounds, scale, layout.fan);

    const u = this.uniforms.uniforms;
    u.uCentre.set([box.left - hostBox.left + box.width / 2, box.top - hostBox.top + box.height / 2]);
    u.uWindow.set([box.width, box.height]);
    u.uCylinder.set([c.r, c.p, c.maxPhi]);
    // The flat texture's actual size, which rounding up to whole device pixels makes a little larger.
    u.uFlat.set([bounds.x, bounds.y, art.under.width / scale, art.under.height / scale]);

    if (this.app.renderer.width !== hostBox.width || this.app.renderer.height !== hostBox.height) {
      this.app.renderer.resize(hostBox.width, hostBox.height);
    }
    this.mesh ??= this.makeMesh();
    this.mesh.shader!.resources.uTexture = this.baked.flat.source;
    this.mesh.scale.set(hostBox.width, hostBox.height);
    // Only now that the shader samples the new texture can the old one go.
    if (old) drop(old);
    this.stale = true;
    this.lastDraw = -Infinity;
  }

  /** The flat drawing's layers as sprites, in flat-texture pixels: the whole of it, and the animated patch. */
  private compose(art: PodArt, bounds: Rect, scale: number, fanRect: Rect): Baked {
    const under = canvasTexture(art.under, "nearest");
    const over = canvasTexture(art.over, "nearest");
    const fan = canvasTexture(art.fan, "linear");
    const light = canvasTexture(art.stasis, "nearest");
    const flat = RenderTexture.create({ width: art.under.width, height: art.under.height, resolution: 1, scaleMode: "linear" });
    const px = (x: number) => (x - bounds.x) * scale;
    const py = (y: number) => (y - bounds.y) * scale;

    const x0 = Math.max(0, Math.floor(px(art.patch.x)));
    const y0 = Math.max(0, Math.floor(py(art.patch.y)));
    const x1 = Math.min(art.under.width, Math.ceil(px(art.patch.x + art.patch.width)));
    const y1 = Math.min(art.under.height, Math.ceil(py(art.patch.y + art.patch.height)));
    const patchFrame = new Rectangle(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    const underPatch = new Texture({ source: under.source, frame: patchFrame });
    const overPatch = new Texture({ source: over.source, frame: patchFrame });

    const fans: Sprite[] = [];
    const lights: Sprite[] = [];
    const layers = (behind: Texture, front: Texture, at: { x: number; y: number }) => {
      const c = new Container();
      const fanSprite = new Sprite({ texture: fan, anchor: 0.5 });
      fanSprite.position.set(px(fanRect.x + fanRect.width / 2), py(fanRect.y + fanRect.height / 2));
      const lightSprite = new Sprite(light);
      lightSprite.position.set(px(art.stasisRect.x), py(art.stasisRect.y));
      c.addChild(new Sprite({ texture: behind, x: at.x, y: at.y }), fanSprite, new Sprite({ texture: front, x: at.x, y: at.y }), lightSprite);
      fans.push(fanSprite);
      lights.push(lightSprite);
      return c;
    };
    const full = layers(under, over, { x: 0, y: 0 });
    const patch = layers(underPatch, overPatch, { x: x0, y: y0 });
    return { textures: [under, over, fan, light, underPatch, overPatch], flat, full, patch, fans, lights };
  }

  private makeMesh(): Mesh<Geometry, Shader> {
    const geometry = new Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: "pod-bend" }),
      resources: { uTexture: this.baked!.flat.source, pod: this.uniforms },
    });
    const mesh = new Mesh({ geometry, shader });
    this.app.stage.addChild(mesh);
    return mesh;
  }

  private request() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.tick);
  }

  /** Steps the fan and the light, at most 30 times a second, and draws. Keeps going while the page shows. */
  private tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed || !this.ready) return;
    if (this.needsBake) this.bake();
    if (!this.baked) return;
    if (!this.lost && now - this.lastDraw >= FRAME_MS - 1) {
      this.lastDraw = now;
      this.draw(now);
    }
    this.request();
  };

  private draw(now: number) {
    const b = this.baked!;
    const still = this.reducedMotion.matches;
    for (const f of b.fans) f.rotation = fanAngle(now, still);
    for (const l of b.lights) l.alpha = stasisAlpha(now, still);
    const renderer = this.app.renderer;
    renderer.render({ container: this.stale ? b.full : b.patch, target: b.flat, clear: this.stale });
    this.stale = false;
    renderer.render(this.app.stage);
    if (this.host.dataset.art !== "ready") this.host.dataset.art = "ready";
  }

  private onContextLost = () => {
    this.lost = true;
  };

  private onContextRestored = () => {
    this.lost = false;
    this.stale = true;
    this.request();
  };

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resize?.disconnect();
    if (!this.ready) return;
    this.app.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.app.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    if (this.baked) drop(this.baked);
    this.baked = null;
    this.app.destroy({ removeView: true }, { children: true });
  }
}
