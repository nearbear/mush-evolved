// Dev-only design kit for mush2's own components (/design-kit-mush2), next to the Mush art kit (design-kit.html).
// Each section renders a real component from web/src with sample props, so it can be checked in isolation.
// Sample text is English only: this page never ships.

import { bustIcon, ENDING_ART, SHIP_CARD_ICONS } from "../art/assets.ts";
import { ShipCard, type ShipCardHighlight } from "../games/ShipCard.tsx";
import { Tabs } from "@base-ui/react/tabs";
import { SelfHud, SelfPoints } from "../hud/SelfHud.tsx";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { AccountSection, CharacterPickerSection } from "./LobbySections.tsx";
import { EndingsSection, ITrackieSection, PatrolSection, SignalSection, TerminalBodiesSection } from "./GameSections.tsx";
import { InspectSection, InventorySection, ItemAttrIconsSection, PeekBarSection, RoomCornerSection, ShipOverlaySection, StatusIconsSection, TopBarSection } from "./HudSections.tsx";
import { noop } from "./KitSection.tsx";
import { SurfaceSection } from "./SurfaceSection.tsx";
import { freshView, humanView, lethargyView, mushView } from "./samples.ts";
import "./mush2Kit.css";

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

/** The header nav, in page order. */
const NAV: [id: string, label: string][] = [
  ["surfaces", "Surface ramps"],
  ["ship-card", "Ship card"],
  ["terminal", "Terminal frame"],
  ["terminal-bodies", "Terminals"],
  ["sol-signal", "Sol signal"],
  ["top-bar", "Top bar"],
  ["self-hud", "Self HUD"],
  ["self-points", "AP and MP"],
  ["ship-overlay", "Ship card (phone)"],
  ["inspect", "Inspect"],
  ["inventory", "Inventory"],
  ["room-corners", "Queue and tips"],
  ["peek-bar", "Peek bar"],
  ["status-icons", "Status icons"],
  ["item-attr-icons", "Item icons"],
  ["patrol", "Patrol"],
  ["itrackie", "iTrackie"],
  ["endings", "Death and end"],
  ["character-picker", "Character picker"],
  ["account", "Account"],
];

export default function Mush2Kit() {
  return (
    <div className="m2k">
      <header className="m2k-header">
        <h1>Design kit (mush2)</h1>
        <nav aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
          <a href="/design-kit.html">Mush art kit</a>
        </nav>
      </header>
      <main>
        <SurfaceSection />
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
        <TerminalBodiesSection />
        <SignalSection />
        <TopBarSection />
        <section id="self-hud">
          <h2>Self HUD</h2>
          <p>
            <code>hud/SelfHud.tsx</code>: the desktop ID card over the room view&apos;s top left (faction band,
            portrait, name, held titles), with HP, morale and satiety on a plain strip beside it. It takes a real <code>PlayerView</code> from <code>designKit/sampleView.ts</code>; here it sits in
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
                <SelfHud view={mushView} onInspect={noop} />
              </div>
              <figcaption>Mush (spores in the resources)</figcaption>
            </figure>
          </div>
        </section>
        <section id="self-points">
          <h2>AP and MP</h2>
          <p>
            <code>hud/SelfHud.tsx</code>&apos;s <code>SelfPoints</code>: AP and MP standing up, from the room view&apos;s
            bottom left. Past 14 slots the AP gauge wraps into even columns (<code>hud/apGauge.ts</code>); Lethargy&apos;s
            24 AP makes two of 12.
          </p>
          <div className="m2k-row m2k-bottom">
            <figure>
              <SelfPoints view={freshView} />
              <figcaption>Full</figcaption>
            </figure>
            <figure>
              <SelfPoints view={humanView} />
              <figcaption>3 AP and 1 MP spent</figcaption>
            </figure>
            <figure>
              <SelfPoints view={mushView} />
              <figcaption>Out of AP</figcaption>
            </figure>
            <figure>
              <SelfPoints view={lethargyView} />
              <figcaption>Lethargy: two AP columns, partly spent</figcaption>
            </figure>
          </div>
        </section>
        <ShipOverlaySection />
        <InspectSection />
        <InventorySection />
        <RoomCornerSection />
        <PeekBarSection />
        <StatusIconsSection />
        <ItemAttrIconsSection />
        <PatrolSection />
        <ITrackieSection />
        <EndingsSection />
        <CharacterPickerSection />
        <AccountSection />
      </main>
    </div>
  );
}
