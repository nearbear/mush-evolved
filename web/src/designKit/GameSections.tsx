// The kit's terminal, patrol, iTrackie and end-of-life sections, on sample views (samples.ts). Dev-only.

import { useState } from "react";
import { BodyTakenDialog } from "../hud/BodyTakenDialog.tsx";
import { DeathNotice } from "../hud/DeathNotice.tsx";
import { EndScreen } from "../hud/EndScreen.tsx";
import { ITrackie } from "../hud/ITrackie.tsx";
import { PatrolCockpit } from "../hud/PatrolCockpit.tsx";
import { TerminalBody } from "../hud/TerminalDialog.tsx";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { terminalLogin } from "../hud/terminalUsername.ts";
import { useNames } from "../i18n/names.ts";
import type { PlayerView } from "@mush2/shared";
import { Figure, noop, Section } from "./KitSection.tsx";
import { bodyTakenView, chatView, deadMushView, deadView, edenView, mushWinView, patrolView, terminalSamples } from "./samples.ts";

export function TerminalBodiesSection() {
  const names = useNames();
  return (
    <Section
      id="terminal-bodies"
      heading="Terminals"
      about={
        <>
          <code>hud/TerminalDialog.tsx</code>&apos;s <code>TerminalBody</code> in each terminal&apos;s{" "}
          <code>TerminalFrame</code>, seen by a Pilot commander at a fresh ship&apos;s terminals (with one planet found). Inside:
          the research and project lists, PILGRED, <code>PlanetList</code> (its Share button opens{" "}
          <code>SharePlanetDialog</code>), <code>CommandTerminal</code> (<code>ShipNavigation</code>,{" "}
          <code>UnavailableButton</code>), <code>CommsCenter</code>, <code>BiosTerminal</code> and <code>TurretPanel</code>{" "}
          (<code>HunterList</code>).
        </>
      }
    >
      {terminalSamples.map(({ view, terminal }) => (
        <Figure key={terminal.id} caption={names.equipment(terminal.type)}>
          <div className="terminal-popup kit-panel m2k-terminal m2k-terminal-tall">
            <TerminalFrame name={names.equipment(terminal.type)} type={terminal.type} login={terminalLogin(terminal.type, view)} onClose={noop}>
              <TerminalBody terminal={terminal} view={view} onAction={noop} onSharePlanet={noop} />
            </TerminalFrame>
          </div>
        </Figure>
      ))}
    </Section>
  );
}

export function PatrolSection() {
  const ship = patrolView.patrolShip;
  return (
    <Section
      id="patrol"
      heading="Patrol cockpit"
      about={
        <>
          <code>hud/PatrolCockpit.tsx</code>: what the room view shows while you fly a patrol ship (armor, debris, the
          cockpit to select, and the battle&apos;s <code>HunterList</code>).
        </>
      }
    >
      {ship && (
        <Figure caption="Just took off from bay A, no hunters">
          <div className="room-view m2k-room m2k-room-auto">
            <PatrolCockpit view={patrolView} ship={ship} selected={{ kind: "player", id: patrolView.you.id }} onSelect={noop} onAction={noop} />
          </div>
        </Figure>
      )}
    </Section>
  );
}

const CHANNELS = { onCreate: noop, onInvite: noop, onLeave: noop };

export function ITrackieSection() {
  return (
    <Section
      id="itrackie"
      heading="iTrackie"
      about={
        <>
          <code>hud/ITrackie.tsx</code>: the right panel. Room log (<code>FeedEntry</code> rows; the expedition line opens{" "}
          <code>ExpeditionReportDialog</code>), global chat (<code>Thread</code>: <code>MessageEntry</code>,{" "}
          <code>Markdown</code> checklists, <code>ChatInput</code>), <code>Threads</code>, the features (
          <code>SharedPlanets</code> under Astrophysics, <code>ResearchTracker</code>) and <code>PrivateChannels</code>. Hua
          shared a planet, flew the Icarus to it, and the crew talked a little. Posting does nothing here.
        </>
      }
    >
      <Figure caption="After an expedition">
        <div className="m2k-itrackie">
          <ITrackie view={chatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />
        </div>
      </Figure>
    </Section>
  );
}

/** A button that shows a dialog component until it closes itself. */
function Opener({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && children(() => setOpen(false))}
    </>
  );
}

function SampleEnd({ view, label }: { view: PlayerView; label: string }) {
  return <Opener label={label}>{(close) => <EndScreen view={view} open onOpenChange={(o) => !o && close()} />}</Opener>;
}

export function EndingsSection() {
  return (
    <Section
      id="endings"
      heading="Death, Transfer and the end"
      about={
        <>
          <code>hud/DeathNotice.tsx</code> replaces the room view once you die (the Mush version mentions the Mush channel).{" "}
          <code>hud/BodyTakenDialog.tsx</code> is the pop-up a Transfer victim must acknowledge; <code>hud/EndScreen.tsx</code>{" "}
          shows the ending and every seat&apos;s role. The dialogs open from the buttons.
        </>
      }
    >
      <Figure caption="Dead (human)">
        <div className="room-view m2k-room m2k-room-auto">
          <DeathNotice view={deadView} />
        </div>
      </Figure>
      <Figure caption="Dead (Mush)">
        <div className="room-view m2k-room m2k-room-auto">
          <DeathNotice view={deadMushView} />
        </div>
      </Figure>
      <Figure caption="Dialogs">
        <div className="m2k-buttons">
          <Opener label="Body taken">{(close) => <BodyTakenDialog view={bodyTakenView} onAcknowledge={close} />}</Opener>
          <SampleEnd view={edenView} label="End: Eden" />
          <SampleEnd view={mushWinView} label="End: humans dead" />
        </div>
      </Figure>
    </Section>
  );
}
