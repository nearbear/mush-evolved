// The Pixi renderer behind the SceneRenderer seam: a thin component around PixiRenderer. Loaded
// lazily (IsoRoom), so Pixi is only downloaded by players who pick it in the settings.

import { useContext, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { BackdropContext } from "../backdrop.ts";
import type { SceneRendererProps } from "../scene.ts";
import { PixiRenderer } from "./PixiRenderer.ts";

export default function PixiScene({ scene, ref }: SceneRendererProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<PixiRenderer | null>(null);
  // Desktop: the canvas goes in the screen-wide backdrop (iso/backdrop.ts); phones keep it here.
  const backdrop = useContext(BackdropContext);
  const latest = useRef({ scene, frame: null as Parameters<PixiRenderer["setFrame"]>[0] | null });
  latest.current.scene = scene;
  // A layout effect, so the renderer exists before the scene below is handed to it. A new backdrop (the layout
  // switching between phone and desktop) makes a new renderer, handed the scene and frame the old one had.
  useLayoutEffect(() => {
    const r = new PixiRenderer(host.current!, backdrop);
    renderer.current = r;
    r.setScene(latest.current.scene);
    if (latest.current.frame) r.setFrame(latest.current.frame);
    return () => {
      r.destroy();
      renderer.current = null;
    };
  }, [backdrop]);
  useLayoutEffect(() => renderer.current?.setScene(scene), [scene]);
  useImperativeHandle(
    ref,
    () => ({
      setFrame: (frame) => {
        latest.current.frame = frame;
        renderer.current?.setFrame(frame);
      },
    }),
    [],
  );
  return <div ref={host} className="iso-pixi" />;
}
