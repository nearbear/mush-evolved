// Hand-written Pixi filters for the looks in effects.ts (WebGL only; the renderer asks for WebGL and
// draws no effects on anything else). Blur is a plain Gaussian over the sprite's alpha, sampled in
// CSS pixels: the sprites are small, so a single pass is cheaper than a separable blur's extra target.
//
// Filters are shared: every sprite with the same look uses one filter, and every see-through outline
// uses one of two pairs (pulsing or faint), so a walk frame binds a handful of programs, not one per
// person. The colors are premultiplied, as Pixi's render targets are.

import { Color, Filter, GlProgram, UniformGroup } from "pixi.js";
import { ESP, type Look, paddingOf } from "./effects.ts";

// Pixi's default filter vertex shader: a quad over the filter's area, in the input texture's coordinates.
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

// Shared by the fragment shaders: alpha at a point (clamped to the sprite's area of the texture, which
// the padding keeps transparent at its edges) and a Gaussian blur of it, up to 3 sigmas wide.
const blur = `
uniform sampler2D uTexture;
uniform highp vec4 uInputSize; // highp, as in the vertex shader: a uniform both stages use must match
uniform vec4 uInputClamp;

const int MAX_R = 5;

vec4 at(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

float blurred(vec2 uv, float sigma, int channel) {
  if (sigma <= 0.0) return at(uv)[channel];
  int r = min(MAX_R, int(ceil(3.0 * sigma)));
  float sum = 0.0;
  float weights = 0.0;
  for (int y = -MAX_R; y <= MAX_R; y++) {
    for (int x = -MAX_R; x <= MAX_R; x++) {
      if (abs(x) > r || abs(y) > r) continue;
      float w = exp(-float(x * x + y * y) / (2.0 * sigma * sigma));
      sum += w * at(uv + vec2(x, y) * uInputSize.zw)[channel];
      weights += w;
    }
  }
  return sum / weights;
}
`;

// drop-shadow() under the sprite, then brightness(), then a glow (a colored drop-shadow with no offset),
// in that order as in styles/iso.css.
const lookFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
${blur}
uniform float uBrightness;
uniform vec4 uShadow;
uniform vec3 uShadowAt;
uniform vec4 uGlow;
uniform float uGlowSigma;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  if (uShadow.a > 0.0) {
    float a = uShadow.a * blurred(vTextureCoord - uShadowAt.xy * uInputSize.zw, uShadowAt.z, 3);
    c += vec4(uShadow.rgb * a, a) * (1.0 - c.a);
  }
  c.rgb = min(c.rgb * uBrightness, vec3(c.a));
  if (uGlow.a > 0.0) {
    float a = uGlow.a * blurred(vTextureCoord, uGlowSigma, 3);
    c += vec4(uGlow.rgb * a, a) * (1.0 - c.a);
  }
  finalColor = c;
}
`;

// Outline, first pass: the 1px rim just outside the silhouette (feMorphology dilate, then "out"), packed
// with the silhouette's alpha into an opaque texel for the second pass.
const rimFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
${blur}

void main(void) {
  float grown = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) grown = max(grown, at(vTextureCoord + vec2(x, y) * uInputSize.zw).a);
  }
  float a = at(vTextureCoord).a;
  finalColor = vec4(grown * (1.0 - a), a, 0.0, 1.0);
}
`;

// Outline, second pass: the rim's glow, the faint fill and the rim, merged in that order (feMerge).
const espFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
${blur}
uniform vec3 uColor;
uniform float uGlowSigma;
uniform float uFill;
uniform float uAlpha;

void main(void) {
  vec4 color = vec4(uColor, 1.0);
  vec4 packed = at(vTextureCoord);
  vec4 c = color * blurred(vTextureCoord, uGlowSigma, 0);
  float fill = uFill * packed.g;
  c = color * fill + c * (1.0 - fill);
  c = color * packed.r + c * (1.0 - packed.r);
  finalColor = c * uAlpha;
}
`;

const program = (name: string, fragment: string) => GlProgram.from({ vertex, fragment, name });

const rgba = (css: string, alpha: number): number[] => [...new Color(css).toArray().slice(0, 3), alpha];

/** The filter that draws a look. Shared by every sprite with that look, so it is built once per renderer. */
export function lookFilter(look: Look, color: (token: string) => string, resolution: number): Filter {
  const glow = look.glow;
  const shadow = look.shadow;
  return new Filter({
    glProgram: program("iso-look", lookFragment),
    resources: {
      look: new UniformGroup({
        uBrightness: { value: look.brightness, type: "f32" },
        uShadow: { value: new Float32Array(shadow ? [0, 0, 0, shadow.alpha] : [0, 0, 0, 0]), type: "vec4<f32>" },
        uShadowAt: { value: new Float32Array(shadow ? [shadow.x, shadow.y, shadow.sigma] : [0, 0, 0]), type: "vec3<f32>" },
        uGlow: { value: new Float32Array(glow ? rgba(color(glow.token), 1) : [0, 0, 0, 0]), type: "vec4<f32>" },
        uGlowSigma: { value: glow?.sigma ?? 0, type: "f32" },
      }),
    },
    padding: paddingOf(look),
    resolution,
    antialias: "off",
  });
}

/** The two passes of the see-through outline, at a fixed or changing opacity (`alpha`). */
export class EspFilters {
  readonly filters: Filter[];
  private readonly uniforms: UniformGroup;

  constructor(color: string, alpha: number, resolution: number) {
    this.uniforms = new UniformGroup({
      uColor: { value: new Float32Array(new Color(color).toArray().slice(0, 3)), type: "vec3<f32>" },
      uGlowSigma: { value: ESP.glowSigma, type: "f32" },
      uFill: { value: ESP.fill, type: "f32" },
      uAlpha: { value: alpha, type: "f32" },
    });
    const options = { padding: ESP.padding, resolution, antialias: "off" } as const;
    this.filters = [
      new Filter({ ...options, glProgram: program("iso-esp-rim", rimFragment), resources: {} }),
      new Filter({ ...options, glProgram: program("iso-esp", espFragment), resources: { esp: this.uniforms } }),
    ];
  }

  set alpha(alpha: number) {
    this.uniforms.uniforms.uAlpha = alpha;
  }

  destroy() {
    for (const f of this.filters) f.destroy();
  }
}
