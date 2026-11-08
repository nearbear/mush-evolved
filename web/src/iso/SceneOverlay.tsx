// Status badges, action bars and speech bubbles over the heads of the people in this room. Always
// DOM, whatever renders the scene (chat text stays in the DOM), in a world of its own above the
// renderer's that moves with the same camera and walker offsets, so nothing in the scene can cover it.

import { useRef, type CSSProperties, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { ActionBar } from "../scene/ActionBar.tsx";
import { overheadStatuses } from "@mush2/shared";
import { StatusBadges } from "../scene/StatusBadges.tsx";
import { BUBBLE_MS, type Bubble } from "../scene/useSpeechBubbles.ts";
import { Markdown } from "../hud/Markdown.tsx";
import type { FrameTarget, Occupant } from "./scene.ts";
import { useDomFrame } from "./useDomFrame.ts";

/** Where a person's sprite is drawn (world pixels, as in the Scene); their badges sit over it. */
export interface Anchor {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  person: Occupant;
}

export function SceneOverlay({
  anchors,
  width,
  height,
  bubbles,
  ref,
}: {
  anchors: readonly Anchor[];
  width: number;
  height: number;
  bubbles: ReadonlyMap<string, Bubble[]>;
  ref?: Ref<FrameTarget>;
}) {
  const { t } = useTranslation();
  const world = useRef<HTMLDivElement>(null);
  useDomFrame(world, ref);
  return (
    <div ref={world} className="iso-world" style={{ width, height }}>
      <div className="iso-layer iso-badges">
        {anchors.map(({ key, x, y, width, height, person: o }) => (
          <div key={key} className={`iso-badge-anchor${o.busy ? " busy" : ""}`} style={{ left: x, top: y, width, height }} data-walker={o.id}>
            {o.busy && (
              <ActionBar bar={o.busy.bar} label={o.busy.label ? t("queue.underWay", { action: o.busy.label }) : t("queue.busy")} />
            )}
            <StatusBadges statuses={o.statuses} />
            {bubbles.get(o.id) && (
              <div className={`speech-bubbles${overheadStatuses(o.statuses).length ? " raised" : ""}`}>
                {bubbles.get(o.id)!.map((b) => (
                  <div key={b.id} className="speech-bubble" style={{ "--bubble-ms": `${BUBBLE_MS}ms` } as CSSProperties}>
                    <Markdown text={b.text} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
