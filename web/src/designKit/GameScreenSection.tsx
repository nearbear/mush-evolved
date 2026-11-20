// The kit's game screen: the real top bar, Inspect, ID card, room plaque and iTrackie together in the game's layout,
// so the chrome (tokens.css's Dusk ramp and card.css's chamfered, glowing cards) reads as it does in play. Only the room
// scene is a skeleton (it needs the PixiJS renderer). Dev-only.

import { ITrackie } from "../hud/ITrackie.tsx";
import { SelfHud } from "../hud/SelfHud.tsx";
import { ShipOverlay } from "../hud/ShipOverlay.tsx";
import { useMobile } from "../useMobile.ts";
import { GameFrame, SkeletonRoom } from "./GameFrame.tsx";
import { CHANNELS } from "./GameSections.tsx";
import { SampleInspect, SampleTopBar } from "./HudSections.tsx";
import { noop, Section } from "./KitSection.tsx";
import { chatView, humanView } from "./samples.ts";

export function GameScreenSection() {
  const mobile = useMobile();
  return (
    <Section
      id="game-screen"
      heading="Game screen"
      about={
        <>
          The whole screen as <code>GameView.tsx</code> lays it out: <code>TopBar</code>, then <code>InspectPanel</code> |
          the room view (<code>SelfHud</code>, or <code>ShipOverlay</code> on phones, and the room plaque over the scene) | <code>ITrackie</code>. Surfaces come from{" "}
          <code>styles/tokens.css</code> (<code>--chrome-0</code> scene, <code>--chrome-1</code> panels,{" "}
          <code>--chrome-2</code> cards on the scene, <code>--chrome-line</code> edges) and <code>styles/card.css</code>.
          Below 1024px it is the phone layout: the bottom nav switches panels.
        </>
      }
      row="m2k-stack"
    >
      <figure>
        <GameFrame
          panel="room"
          topBar={<SampleTopBar view={humanView} />}
          inspect={<SampleInspect view={humanView} target={{ kind: "player", id: humanView.you.id }} />}
          room={
            <>
              <SkeletonRoom />
              {mobile ? <ShipOverlay view={humanView} /> : <SelfHud view={humanView} onInspect={noop} />}
              <div className="room-corner">
                <div className="room-title">
                  <h2>Laboratory</h2>
                </div>
              </div>
            </>
          }
          itrackie={<ITrackie view={chatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />}
        />
        <figcaption>A human commander in the laboratory; only the room scene is a skeleton</figcaption>
      </figure>
    </Section>
  );
}
