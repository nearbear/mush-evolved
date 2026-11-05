// The lobby's cryopod backdrop: a thin component around PodRenderer. Loaded lazily (Lobby.tsx), so
// the page and its panel show at once and the pod fades in behind them.

import { type RefObject, useEffect, useRef } from "react";
import { PodRenderer } from "./PodRenderer.ts";

export default function PodBackdrop({ pod, sticker }: { pod: RefObject<HTMLElement | null>; sticker: RefObject<HTMLElement | null> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = new PodRenderer(host.current!, pod.current!, sticker.current);
    return () => r.destroy();
  }, [pod, sticker]);
  return <div ref={host} className="pod-backdrop" aria-hidden="true" />;
}
