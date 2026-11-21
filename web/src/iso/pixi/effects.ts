// What the scene's effects look like in the Pixi renderer, as numbers: the same looks as the fx-*,
// shadow-* and iso-esp rules in styles/iso.css, which stay the reference. Pure (no Pixi), so it is
// tested; filters.ts turns a Look into a shader.
//
// CSS blur radii are converted to Gaussian sigmas as radius / 2, the way browsers draw drop-shadow().

import type { SceneSprite } from "../scene.ts";

/** A CSS color token the look is drawn in, read from the page so styles/tokens.css stays the source. */
export type Token = "--accent" | "--highlight" | "--danger";

export interface Shadow {
  /** Offset and Gaussian sigma, in CSS pixels. */
  x: number;
  y: number;
  sigma: number;
  /** The shadow is black at this opacity. */
  alpha: number;
}

export interface Glow {
  token: Token;
  sigma: number;
  /** Multiplies the blurred alpha (capped at 1), so the glow's inner part is a solid band. 1 when absent. */
  gain?: number;
  /** Fades in and out with selectionPulse; one shared uniform drives every pulsing glow. */
  pulse?: boolean;
}

/** One sprite's look beyond its image: fog stays a tint (cheap, batched); the rest needs a filter. */
export interface Look {
  /** Multiplies the color: fog, where it can only darken. */
  tint: number;
  /** brightness() above 1, which a tint can't do. 1 when there's none. */
  brightness: number;
  shadow?: Shadow;
  glow?: Glow;
}

/** brightness() as a multiply: fogged rooms at 0.3, a lifted one at 0.5. */
const TINT = { fogged: 0x4d4d4d, foggedLifted: 0x808080 } as const;

const SHADOWS = {
  standing: { x: 0, y: 3, sigma: 1, alpha: 0.6 },
  lying: { x: 0, y: 2, sigma: 0.5, alpha: 0.6 },
} as const satisfies Record<NonNullable<SceneSprite["shadow"]>, Shadow>;

export function lookOf(s: SceneSprite): Look {
  const look: Look = { tint: 0xffffff, brightness: 1, shadow: s.shadow && SHADOWS[s.shadow] };
  switch (s.effect) {
    case "fogged":
    case "foggedLifted":
      look.tint = TINT[s.effect];
      break;
    case "hover":
      look.brightness = 1.2;
      break;
    case "doorHover":
      look.brightness = 1.35;
      look.glow = { token: "--accent", sigma: 1.5 };
      break;
    case "selected":
      // Thick and pulsing: on phones it is the only sign of what the peek bar acts on (the bar shows no name).
      look.glow = { token: "--highlight", sigma: 1.5, gain: 3, pulse: true };
      break;
    case "broken":
      look.glow = { token: "--danger", sigma: 1 };
      break;
  }
  return look;
}

/** Which filter a look needs: sprites with the same key share one filter. "" when none. */
export function filterKey(look: Look): string {
  const { brightness, shadow, glow } = look;
  if (brightness === 1 && !shadow && !glow) return "";
  return [brightness, shadow ? `${shadow.x},${shadow.y},${shadow.sigma},${shadow.alpha}` : "", glow ? `${glow.token},${glow.sigma},${glow.gain ?? 1},${glow.pulse ? "p" : ""}` : ""].join("|");
}

/** How far a filter draws outside the sprite, in CSS pixels: three sigmas of blur past any offset. */
export function paddingOf(look: Look): number {
  const shadow = look.shadow ? Math.max(Math.abs(look.shadow.x), Math.abs(look.shadow.y)) + 3 * look.shadow.sigma : 0;
  const glow = look.glow ? 3 * look.glow.sigma : 0;
  return Math.ceil(Math.max(shadow, glow));
}

/**
 * The selection glow's opacity: from 0.5 to 1 and back every 1.2s (sel-pulse in iso.css, ease-in-out, alternate), held
 * at 1 with reduced motion. Quicker than the see-through outline's, so the selection is what draws the eye.
 */
export function selectionPulse(now: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const t = (now % 1200) / 600;
  const p = t <= 1 ? t : 2 - t;
  return 0.5 + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * p));
}

/** The see-through outline: a 1px rim, its glow (sigma in CSS pixels) and a faint fill, in --glow-rim. */
export const ESP = { glowSigma: 1.5, fill: 0.3, padding: 6, faint: 0.45 } as const;

/**
 * The outline's opacity: from 0.65 to 1 and back every 3.2s (esp-pulse, ease-in-out, alternate), held
 * at 1 with reduced motion. One clock for every outline, where CSS starts each one's when it mounts.
 */
export function espPulse(now: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const t = (now % 3200) / 1600;
  const p = t <= 1 ? t : 2 - t;
  return 0.65 + 0.35 * (0.5 - 0.5 * Math.cos(Math.PI * p));
}
