// The kit's surface-ramp comparison (UI coherence plan, step 2): the game screen's chrome under today's colours and
// under the two shortlisted three-step ramps (E chosen for now), before tokens.css changes. Dev-only; the ramps live in
// mush2Kit.css and are scoped to each figure.

import type { PlayerView } from "@mush2/shared";
import { ITrackie } from "../hud/ITrackie.tsx";
import { SelfHud, SelfPoints } from "../hud/SelfHud.tsx";
import { CHANNELS } from "./GameSections.tsx";
import { SampleInspect, SampleTopBar } from "./HudSections.tsx";
import { noop, Section } from "./KitSection.tsx";
import { chatView, humanView } from "./samples.ts";

/**
 * Round 2 (2026-11-11). The owner kept D and E and chose E for now; Today stays as the reference. Both use Dusk fills
 * (today's indigo, greyed) and keep Mush's saturated blue in the edges only.
 */
const RAMPS: [id: string, name: string, about: string][] = [
  ["today", "Today (reference)", "room #0a0f1c, panel #1a1b4a, rim #26378c; tooltip-art frame"],
  ["dusk-glow", "E. Dusk, tooltip glow (chosen for now)", "Dusk fills #0b0b17 · #17172c · #21213d; a 1px #3965fb edge with a blue glow fading inward, as the tipbg art does."],
  ["dusk-line", "D. Dusk, Mush-blue edges", "Dusk fills; rim #2f4fc0 and a 3px top cap in the tooltip art's #3965fb. The familiar blue lives in the lines, not the fills."],
];

function Screen({ view }: { view: PlayerView }) {
  return (
    <div className="m2k-ramp-screen">
      <SampleTopBar view={view} />
      <div className="m2k-ramp-cols">
        <SampleInspect view={view} target={{ kind: "player", id: view.you.id }} />
        <div className="room-view m2k-ramp-room">
          <SelfHud view={view} onInspect={noop} />
          <div className="room-corner">
            <div className="room-title">
              <h2>Laboratory</h2>
            </div>
          </div>
          <div className="m2k-ramp-points">
            <SelfPoints view={view} />
          </div>
        </div>
        <div className="m2k-itrackie">
          <ITrackie view={chatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />
        </div>
      </div>
    </div>
  );
}

export function SurfaceSection() {
  return (
    <Section
      id="surfaces"
      heading="Surface ramps"
      about={
        <>
          Chrome ramps for <code>styles/tokens.css</code>: deepest (scene backdrop, <code>--room-bg</code>),
          panel (<code>--panel-fill</code>: inspect, top bar) and raised (cards on the scene: nameplate, AP and MP, room
          plaque), plus a rim. Panels are opaque in D and E. The tooltip-art frame (<code>tipbg.png</code>) has its
          blue baked in at about 90% opacity, so D and E draw the panel as a flat fill and 1px rim instead; that is
          a stand-in, not the step 3 card. Unchanged: <code>--terminal-bg</code>, the iTrackie&apos;s frame, AP and MP,
          button art, faction colours, the room&apos;s glowing rim and the page background. The muted text keeps AA contrast
          (5.2:1 or better) on the Dusk panel and raised fills.
        </>
      }
      row="m2k-stack"
    >
      {RAMPS.map(([id, name, about]) => (
        <figure key={id} className="m2k-ramp" data-ramp={id}>
          <Screen view={humanView} />
          <figcaption>
            <strong>{name}</strong>: {about}
          </figcaption>
        </figure>
      ))}
    </Section>
  );
}
