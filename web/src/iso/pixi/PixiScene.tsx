// The Pixi renderer behind the SceneRenderer seam: a thin component around PixiRenderer. Loaded
// lazily (IsoRoom), so Pixi is only downloaded by players who pick it in the settings.

import { useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { SceneRendererProps } from "../scene.ts";
import { PixiRenderer } from "./PixiRenderer.ts";

export default function PixiScene({ scene, ref }: SceneRendererProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<PixiRenderer | null>(null);
  // A layout effect, so the renderer exists before the scene below is handed to it.
  useLayoutEffect(() => {
    const r = new PixiRenderer(host.current!);
    renderer.current = r;
    return () => {
      r.destroy();
      renderer.current = null;
    };
  }, []);
  useLayoutEffect(() => renderer.current?.setScene(scene), [scene]);
  useImperativeHandle(ref, () => ({ setFrame: (frame) => renderer.current?.setFrame(frame) }), []);
  return <div ref={host} className="iso-pixi" />;
}
