// Per-frame updates for a DOM layer of the room view (the DOM renderer, and the overlay of badges and
// bubbles every renderer keeps): the camera moves `world` with a transform, and each `data-walker`
// element inside it is shifted by its walker's offset. React placed them at their cell; this only
// adds the pixels in between, so walking costs no re-render.

import { useImperativeHandle, useLayoutEffect, useRef, type Ref, type RefObject } from "react";
import type { FrameTarget } from "./scene.ts";

export function useDomFrame(world: RefObject<HTMLElement | null>, ref: Ref<FrameTarget> | undefined) {
  // Found once per commit, not on every frame: the world can hold thousands of sprites.
  const nodes = useRef<HTMLElement[]>([]);
  useLayoutEffect(() => {
    nodes.current = [...(world.current?.querySelectorAll<HTMLElement>("[data-walker]") ?? [])];
  });
  useImperativeHandle(
    ref,
    () => ({
      setFrame({ camera, offsetOf }) {
        const el = world.current;
        if (!el) return;
        // Only changed values are written, so standing people cost nothing per frame.
        for (const node of nodes.current) {
          const o = offsetOf(node.dataset.walker!);
          const translate = o.x || o.y ? `${o.x}px ${o.y}px` : "";
          if (node.style.translate !== translate) node.style.translate = translate;
        }
        const transform = `translate(${camera.x}px, ${camera.y}px)`;
        if (el.style.transform !== transform) el.style.transform = transform;
      },
    }),
    [world],
  );
}
