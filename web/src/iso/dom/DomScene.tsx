// DOM renderer for the iso room: every sprite is an absolutely positioned div cropped from its
// image, and DOM order is paint order. It draws the Scene it is given and nothing else (no input, no
// game state); effects are CSS classes (fx-* in styles/iso.css). The class names by role (iso-sprite,
// door, equipment, reachable, iso-actor, you, neighbor, corpse) are what the screenshot tools look for.

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useKeyedSprite } from "../../art/keyedSprite.ts";
import { animId, animStep, frameAt, type SceneAnim, type ScenePicture, type SceneRendererProps, type SceneSprite } from "../scene.ts";
import { useDomFrame } from "../useDomFrame.ts";

export function DomScene({ scene, ref }: SceneRendererProps) {
  const world = useRef<HTMLDivElement>(null);
  useDomFrame(world, ref);
  const espFilter = `iso-esp-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <>
      <div ref={world} className="iso-world" style={{ width: scene.width, height: scene.height }}>
        <div className="iso-layer">
          {scene.sprites.map((s) =>
            s.shadow ? (
              <div key={s.key} className={classOf(s)} style={box(s)} data-walker={s.walker}>
                <Picture picture={{ ...s, x: 0, y: 0 }} className={`iso-pose shadow-${s.shadow}`} />
              </div>
            ) : s.anim ? (
              <Picture key={s.key} picture={s} className={classOf(s)} />
            ) : (
              <div key={s.key} className={classOf(s)} style={pictureStyle(s, s.image.url, 0)} />
            ),
          )}
        </div>
        {/* Every person, in paint order; only those a wall covers show (CSS). Always mounted, so the copy
            plays its walk cycle in step with the person. */}
        <div className="iso-layer iso-esp">
          {scene.outlines.map((o) => (
            <div
              key={o.key}
              className={`iso-actor${o.occluded ? " occluded" : ""}${o.faint ? " neighbor" : ""}`}
              style={{ ...box(o), filter: `url(#${espFilter})` }}
              data-walker={o.walker}
            >
              <Picture picture={{ ...o, x: 0, y: 0 }} className="iso-pose" />
            </div>
          ))}
        </div>
      </div>
      <EspFilter id={espFilter} />
    </>
  );
}

const EFFECT_CLASS = { fogged: "fx-fogged", foggedLifted: "fx-fogged-lifted", hover: "fx-hover", doorHover: "fx-door-hover", selected: "fx-selected" } as const;

function classOf(s: SceneSprite): string {
  const person = s.role === "person" || s.role === "corpse";
  const names = [person ? "iso-actor" : "iso-sprite"];
  if (s.role === "door" || s.role === "equipment" || s.role === "corpse") names.push(s.role);
  if (s.reachable) names.push("reachable");
  if (s.you) names.push("you");
  if (s.effect === "fogged" || s.effect === "foggedLifted") names.push("neighbor");
  if (s.effect) names.push(EFFECT_CLASS[s.effect]);
  return names.join(" ");
}

const box = (p: ScenePicture) => ({ left: p.x, top: p.y, width: p.width, height: p.height });

function pictureStyle(p: ScenePicture, url: string | undefined, frame: number): CSSProperties {
  const { sx, sy } = frameAt(p.image, frame);
  return {
    ...box(p),
    backgroundImage: url && `url(${url})`,
    backgroundPosition: `${-sx}px ${-sy}px`,
    transform: p.flipX || p.flipY ? `scale(${p.flipX ? -1 : 1}, ${p.flipY ? -1 : 1})` : undefined,
  };
}

/** A picture that may be animated or color-keyed. Its frame keeps its own clock, so a step redraws only this element. */
function Picture({ picture, className }: { picture: ScenePicture; className: string }) {
  const frame = useAnimFrame(picture.anim);
  return picture.image.keyed ? (
    <KeyedPicture picture={picture} className={className} frame={frame} />
  ) : (
    <div className={className} style={pictureStyle(picture, picture.image.url, frame)} />
  );
}

/** The crew strips have a solid background color instead of alpha; it is keyed out once per image. */
function KeyedPicture({ picture, className, frame }: { picture: ScenePicture; className: string; frame: number }) {
  const url = useKeyedSprite(picture.image.url ?? "");
  return <div className={`${className} crew-sprite`} style={pictureStyle(picture, url, frame)} />;
}

/** The frame an animation is on (`animStep`), with a timer set for each change until it ends. */
function useAnimFrame(anim: SceneAnim | undefined): number {
  const id = animId(anim);
  const [frame, setFrame] = useState(() => (anim ? animStep(anim, 0).frame : 0));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` stands in for anim, which is rebuilt every render.
  useEffect(() => {
    if (!anim) {
      setFrame(0);
      return;
    }
    const start = performance.now();
    let timer = 0;
    const step = () => {
      const { frame, nextIn } = animStep(anim, performance.now() - start);
      setFrame(frame);
      if (nextIn !== undefined) timer = window.setTimeout(step, nextIn);
    };
    step();
    return () => clearTimeout(timer);
  }, [id]);
  return frame;
}

/**
 * The see-through outline: a 1px rim around the person's silhouette with a soft glow, over a faint fill.
 * An SVG filter, because CSS alone can't outline a sprite without also drawing it.
 */
function EspFilter({ id }: { id: string }) {
  const ALPHA = "SourceAlpha"; // i18n-ignore: SVG filter input name
  return (
    <svg className="iso-esp-defs" aria-hidden="true" width="0" height="0">
      <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
        <feMorphology in={ALPHA} operator="dilate" radius="1" result="grown" />
        <feComposite in="grown" in2={ALPHA} operator="out" result="rim" />
        <feFlood className="iso-esp-color" result="color" />
        <feComposite in="color" in2="rim" operator="in" result="outline" />
        <feGaussianBlur in="outline" stdDeviation="1.5" result="glow" />
        <feComposite in="color" in2={ALPHA} operator="in" result="body" />
        <feComponentTransfer in="body" result="fill">
          <feFuncA type="linear" slope="0.3" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="fill" />
          <feMergeNode in="outline" />
        </feMerge>
      </filter>
    </svg>
  );
}
