// The kit's ship card, terminal frame and Self HUD sections. Dev-only.

import { Tabs } from "@base-ui/react/tabs";
import { bustIcon, ENDING_ART, SHIP_CARD_ICONS } from "../art/assets.ts";
import { ShipCard, type ShipCardHighlight } from "../games/ShipCard.tsx";
import { PlayerSummary } from "../hud/PlayerSummary.tsx";
import { SelfHud } from "../hud/SelfHud.tsx";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { noop } from "./KitSection.tsx";
import { freshView, humanView, lethargyView, mushView } from "./samples.ts";

const icon = (name: string) => SHIP_CARD_ICONS[name]!;

// The design's highlights. Two of its eight icons aren't in Mush/, so they're left out; labels are placeholders
// until the highlights themselves are decided.
const highlights: ShipCardHighlight[] = [
  { icon: icon("mush"), label: "Highlight 1", count: 2 },
  { icon: icon("projects_done"), label: "Highlight 2", count: 17 },
  { icon: icon("research_done"), label: "Highlight 3", count: 16 },
  { icon: icon("survival"), label: "Highlight 4", count: 11 },
  { icon: icon("plasma"), label: "Highlight 5" },
  { icon: icon("pa_pilgred"), label: "Highlight 6" },
];

export function ShipCardSection() {
  return (
    <section id="ship-card">
      <h2>Ship card</h2>
      <p>
        <code>games/ShipCard.tsx</code>: one character's finished ship. Every image and sentence is a prop. With{" "}
        <code>to</code> the card is a link with hover and focus states; without it, a plain box.
      </p>
      <div className="m2k-row">
        <figure>
          <ShipCard
            to="#ship-card"
            name="Jin Su"
            portrait={bustIcon("jinsu")}
            score={289}
            background={{ src: ENDING_ART.eden, x: 66, y: 45 }}
            events={[
              { icon: icon("calendar"), caption: "Day 12 Cycle 1", text: "Survived to the end" },
              { icon: icon("eden1"), caption: "Day 12 Cycle 1", text: "The Daedalus has settled on Eden!" },
            ]}
            highlights={highlights}
          />
          <figcaption>The design, as a link</figcaption>
        </figure>
        <figure>
          <ShipCard
            name="Jin Su"
            portrait={bustIcon("jinsu")}
            score={112}
            mush
            background={{ src: ENDING_ART.eden, x: 20, y: 50 }}
            events={[{ icon: icon("eden1"), caption: "Day 12 Cycle 1", text: "The Daedalus has settled on Eden!" }]}
            highlights={highlights.slice(0, 3)}
          />
          <figcaption>
            <code>mush</code>, no <code>to</code>, one event
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function TerminalFrameSection() {
  return (
    <section id="terminal">
      <h2>Terminal frame</h2>
      <p>
        <code>hud/TerminalFrame.tsx</code>: the frame every terminal shares (title bar, cosmetic login, close, icon,
        gold outline). The game puts it in <code>TerminalDialog</code>&apos;s popup; here it sits in a stand-in{" "}
        <code>.terminal-popup.kit-panel</code>. <code>type</code> picks the icon and corner art.
      </p>
      <div className="m2k-row">
        <figure>
          <div className="terminal-popup kit-panel m2k-terminal">
            <TerminalFrame name="PILGRED" type="PILGRED" login={{ user: "jkim", access: "granted" }} onClose={noop}>
              <p>A terminal without tabs: a flat rim under the title bar, and the body scrolls.</p>
              <p>Body text uses the card&apos;s dark text tokens.</p>
            </TerminalFrame>
          </div>
          <figcaption>No tabs, access granted</figcaption>
        </figure>
        <figure>
          <div className="terminal-popup kit-panel m2k-terminal">
            <TerminalFrame name="Com center" type="COM_CENTER" login={{ user: "cwang", access: "limited" }} onClose={noop}>
              <Tabs.Root className="settings-tabs" defaultValue="one">
                <Tabs.List className="settings-tab-list" aria-label="Sample tabs">
                  <Tabs.Tab className="settings-tab" value="one">Overview</Tabs.Tab>
                  <Tabs.Tab className="settings-tab" value="two">Second tab</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="one">
                  <p>The selected tab rises out of the outline; only the open panel scrolls.</p>
                </Tabs.Panel>
                <Tabs.Panel value="two">
                  <p>Second panel.</p>
                </Tabs.Panel>
              </Tabs.Root>
            </TerminalFrame>
          </div>
          <figcaption>Tabbed, access limited (no title)</figcaption>
        </figure>
        <figure>
          <div className="terminal-popup kit-panel m2k-terminal">
            <TerminalFrame name="Command" type="PILOT_MODULE" login={{ user: "klai", access: "hacked" }} onClose={noop}>
              <p>Logged in as the title holder with the hacker kit.</p>
            </TerminalFrame>
          </div>
          <figcaption>Hacked login</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function SelfHudSection() {
  return (
    <section id="self-hud">
      <h2>Self HUD</h2>
      <p>
        <code>hud/SelfHud.tsx</code>: the desktop ID card over the room view&apos;s top left (faction band,
        portrait, name, held titles), with half-size bars in sections split by dividers: AP and MP to the right of the
        name with your other resources in a row under MP, and HP and morale in a row across the foot. Lethargy&apos;s 24 AP makes a long AP bar. It takes a real <code>PlayerView</code> from <code>designKit/sampleView.ts</code>; here it sits in
        a stand-in <code>.room-view</code>, since it is positioned over the room.
      </p>
      <div className="m2k-row">
        <figure>
          <div className="room-view m2k-room">
            <SelfHud view={humanView} onInspect={noop} />
          </div>
          <figcaption>Human, commander with a skill</figcaption>
        </figure>
        <figure>
          <div className="room-view m2k-room">
            <SelfHud view={freshView} onInspect={noop} />
          </div>
          <figcaption>Fresh, no title</figcaption>
        </figure>
        <figure>
          <div className="room-view m2k-room">
            <SelfHud view={lethargyView} onInspect={noop} />
          </div>
          <figcaption>Lethargy: 24 AP</figcaption>
        </figure>
        <figure>
          <div className="room-view m2k-room">
            <SelfHud view={mushView} onInspect={noop} />
          </div>
          <figcaption>Mush (spores in the resources)</figcaption>
        </figure>
        <figure>
          <div className="room-view m2k-room">
            <div className="room-top-left">
              <PlayerSummary view={mushView} tags={null} onInspect={noop} />
            </div>
          </div>
          <figcaption>Phone ID card (PlayerSummary), Mush: meant for phone widths</figcaption>
        </figure>
      </div>
    </section>
  );
}
